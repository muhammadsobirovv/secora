import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { computeNextRunAt } from '../scheduled-job-cron.util.js';
import type { Prisma, ScheduledJobRun } from '../../../prisma-types.js';
import { ScheduledJobRunCompletedEvent, ScheduledJobRunFailedEvent } from '../events/scheduled-job-events.js';
import { PollerLeaseService } from '../../../common/concurrency/poller-lease.service.js';

const LEASE_NAME = 'scheduled-job-runner';
const LEASE_TTL_MS = 90_000; // 1.5x the 60s tick interval — see PollerLeaseService's doc comment.
// Module 18 — task #510. How far past "now" the per-job CAS claim below
// pushes `nextRunAt` while `runJob()` is in flight — comfortably longer
// than any single job's expected dispatch time (these are thin
// dispatchers, see this file's class doc comment) but short enough that a
// job whose `runJob()` call throws before reaching its own `nextRunAt`
// write (an unexpected crash mid-dispatch, not the try/catch'd `dispatch()`
// failure path, which always reaches the write) isn't stuck un-due for long.
const CLAIM_IN_FLIGHT_MS = 5 * 60_000;

/// Executes one ScheduledJob's `kind`-specific action and records a
/// ScheduledJobRun. This is intentionally a thin dispatcher, not a real
/// job-execution engine: PentestHub's actual recon/scan execution lives
/// in the Desktop Agent (Module 7, local-first per ADR 0007) or, for the
/// still-server-side pre-migration paths, Modules 3/4's existing Job
/// Queue — this service's job is to *trigger* those on a schedule (via
/// their existing Prisma tables / command surfaces), not duplicate their
/// execution logic. Each `kind` handler below is deliberately minimal
/// (creates the row the existing module already polls/reacts to) rather
/// than reaching into Module 3/4's internals directly, keeping this
/// module decoupled and avoiding the kind of cross-module rewrite the
/// standing instruction guards against.
///
/// The minute-tick loop is a plain `setInterval` (`OnModuleInit`/
/// `OnModuleDestroy`), not `@nestjs/schedule`'s `@Cron` decorator —
/// deliberately avoiding a new npm dependency this sandbox can't verify
/// installs cleanly (every other module in this project hit the same
/// "npm install can't be confirmed here" constraint; see the Module 7/8
/// verification handoffs). `@nestjs/schedule` is a reasonable drop-in
/// upgrade on a real machine — this hand-rolled loop is functionally
/// equivalent for a once-a-minute poll and has zero new dependencies.
@Injectable()
export class ScheduledJobRunnerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScheduledJobRunnerService.name);
  private intervalHandle: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBus,
    private readonly leases: PollerLeaseService,
  ) {}

  onModuleInit(): void {
    this.intervalHandle = setInterval(() => {
      void this.tick();
    }, 60_000);
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) clearInterval(this.intervalHandle);
  }

  /// Module 10 — High Availability: gated by PollerLeaseService so only
  /// one replica runs due scheduled jobs per tick — see that service's
  /// doc comment for why this matters at more than one replica.
  async tick(): Promise<void> {
    await this.leases.withLease(LEASE_NAME, LEASE_TTL_MS, () => this.runTick());
  }

  private async runTick(): Promise<void> {
    const due = await this.prisma.scheduledJob.findMany({
      where: { enabled: true, deletedAt: null, nextRunAt: { lte: new Date() } },
      take: 50,
    });
    for (const job of due) {
      // Module 18 — task #510 (job queue hardening). `PollerLeaseService`
      // guards against two replicas *starting* a tick at the same moment,
      // but it doesn't renew the lease mid-tick (see its own doc comment
      // — this is a deliberate simplicity tradeoff, not an oversight) —
      // if this tick's 50-job batch takes longer than the lease's TTL, a
      // second replica's next interval could acquire the lease and start
      // its own `runTick()` while this one is still mid-batch, and both
      // would see the same not-yet-updated `nextRunAt` for whichever jobs
      // this replica hasn't reached yet. A per-job optimistic-concurrency
      // claim (compare-and-swap on the exact `nextRunAt` value just read)
      // closes that window without touching the lease mechanism itself:
      // whichever replica's `updateMany` lands first "claims" the job by
      // nudging it out of the due window; the loser's `count` is 0 and it
      // skips — same "atomic conditional update, check the count" idiom
      // `ClaimNextJobsHandler` (distributed-jobs.commands.ts) already uses.
      const claim = await this.prisma.scheduledJob.updateMany({
        where: { id: job.id, nextRunAt: job.nextRunAt },
        data: { nextRunAt: new Date(Date.now() + CLAIM_IN_FLIGHT_MS) },
      });
      if (claim.count === 0) continue;

      try {
        await this.runJob(job.id);
      } catch (error) {
        this.logger.error(`Scheduled job ${job.id} failed`, error instanceof Error ? error.stack : String(error));
      }
    }
  }

  async runJob(jobId: string): Promise<ScheduledJobRun> {
    const job = await this.prisma.scheduledJob.findUniqueOrThrow({ where: { id: jobId } });

    const run = await this.prisma.scheduledJobRun.create({
      data: { scheduledJobId: job.id, status: 'RUNNING' },
    });

    let resultSummary: Record<string, unknown> = {};
    let status: 'SUCCEEDED' | 'FAILED' = 'SUCCEEDED';
    let log = '';

    try {
      resultSummary = await this.dispatch(job);
      log = `Completed ${job.kind} for job "${job.name}".`;
    } catch (error) {
      status = 'FAILED';
      log = error instanceof Error ? error.message : String(error);
    }

    const finishedRun = await this.prisma.scheduledJobRun.update({
      where: { id: run.id },
      data: { status, finishedAt: new Date(), log, resultSummary: resultSummary as Prisma.InputJsonValue },
    });

    await this.prisma.scheduledJob.update({
      where: { id: job.id },
      data: {
        lastRunAt: new Date(),
        lastRunStatus: status,
        nextRunAt: computeNextRunAt(job.cronExpression),
      },
    });

    // Module 10: publish the run's outcome as a real domain event, both
    // for the Activity Timeline and for the webhook dispatcher (see
    // scheduled-job-events.ts's doc comment) — this is the fix for the
    // gap where WEBHOOK_EVENT_TYPES already listed "scheduled_job.completed"
    // as a subscribable event but nothing ever published it.
    if (status === 'SUCCEEDED') {
      this.eventBus.publish(
        new ScheduledJobRunCompletedEvent(job.workspaceId, job.projectId, finishedRun.id, {
          scheduledJobId: job.id,
          kind: job.kind,
          resultSummary,
        }),
      );
    } else {
      this.eventBus.publish(
        new ScheduledJobRunFailedEvent(job.workspaceId, job.projectId, finishedRun.id, {
          scheduledJobId: job.id,
          kind: job.kind,
          log,
        }),
      );
    }

    return finishedRun;
  }

  private async dispatch(job: { id: string; kind: string; workspaceId: string; projectId: string | null; programId: string | null; targetId: string | null; config: unknown }): Promise<Record<string, unknown>> {
    switch (job.kind) {
      case 'SCOPE_REFRESH':
        return this.runScopeRefresh(job.workspaceId, job.programId);
      case 'REPORT_BACKUP':
        return this.runReportBackup(job.workspaceId);
      case 'DAILY_RECON':
      case 'WEEKLY_NUCLEI':
      case 'MONTHLY_ASSET_DISCOVERY':
      case 'SCREENSHOT_UPDATE':
        // These correspond to real recon/scan tool runs (Modules 3/4/7).
        // Server-side, this records the intent to run — the actual
        // execution surface (ReconJob/VulnScanJob creation against a
        // specific Target, or the Desktop Agent's local queue for
        // offline-first workspaces) needs a `targetId` this generic
        // scheduler doesn't always have and a tool selection that's
        // recon/vuln-module-specific. Recording is real (a
        // ScheduledJobRun row with an honest "would trigger X" summary);
        // wiring the actual ReconJob/VulnScanJob creation is flagged in
        // docs/modules/09-*.md's Verification handoff as the concrete
        // integration point for whichever concrete Recon/Vuln command a
        // future pass wires in.
        return { kind: job.kind, note: 'Recorded — wire to ReconJob/VulnScanJob/Desktop Agent queue creation.', targetId: job.targetId };
      case 'CUSTOM':
        return { kind: 'CUSTOM', config: job.config };
      default:
        return { kind: job.kind, note: 'Unhandled kind' };
    }
  }

  private async runScopeRefresh(workspaceId: string, programId: string | null): Promise<Record<string, unknown>> {
    if (!programId) return { note: 'No programId set on this scheduled job.' };
    const program = await this.prisma.bugBountyProgram.findFirst({ where: { id: programId, workspaceId } });
    if (!program) return { note: 'Program not found (may have been deleted).' };
    const scopeItemCount = await this.prisma.bugBountyProgramScopeItem.count({ where: { programId } });
    // A real refresh would re-run the Program Importer against the
    // program's source URL if one is on file — see importers/
    // program-update-detector.ts, which this scheduled kind is designed
    // to call once a program stores enough import provenance to re-fetch
    // automatically (today it only diffs an explicitly re-submitted
    // payload). Recorded honestly as a snapshot for now.
    return { programId, scopeItemCount, refreshedAt: new Date().toISOString() };
  }

  private async runReportBackup(workspaceId: string): Promise<Record<string, unknown>> {
    const reports = await this.prisma.bugReport.findMany({
      where: { workspaceId, deletedAt: null },
      select: { id: true, title: true, status: true, updatedAt: true },
    });
    // "Backup" here means a metadata snapshot recorded in the run's
    // resultSummary — a full export-to-storage backup depends on which
    // object storage a deployment configures, which is operator
    // configuration this module doesn't own. See the ADR for the
    // concrete follow-up.
    return { reportCount: reports.length, snapshotAt: new Date().toISOString() };
  }
}
