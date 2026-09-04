import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { computeNextRunAt } from '../../automation/scheduled-job-cron.util.js';
import { WorkflowExecutorService } from './workflow-executor.service.js';
import { PollerLeaseService } from '../../../common/concurrency/poller-lease.service.js';

const LEASE_NAME = 'workflow-runner';
const LEASE_TTL_MS = 90_000; // 1.5x the 60s tick interval — see PollerLeaseService's doc comment.
// Module 18 — task #510 (job queue hardening). See
// ScheduledJobRunnerService's identical constant for the full rationale:
// `PollerLeaseService` doesn't renew its lease mid-tick, so a batch of up
// to 50 due workflows/resumes that runs long could overlap with a second
// replica's next tick. Per-row CAS claims below close that window.
const CLAIM_IN_FLIGHT_MS = 5 * 60_000;

/// Minute-tick poller — the same hand-rolled `setInterval` +
/// `OnModuleInit`/`OnModuleDestroy` shape as `ScheduledJobRunnerService`,
/// `ReportScheduleRunnerService`, and `WebhookDeliveryQueueService` (see
/// any of their doc comments for why this avoids a new `@nestjs/schedule`
/// dependency). Two independent responsibilities share one tick because
/// they're both "notice something is due, then hand off to
/// WorkflowExecutorService":
///  1. Start a fresh `WorkflowRun` for every enabled `SCHEDULE`-trigger
///     `Workflow` whose `nextRunAt` has passed (reuses
///     `computeNextRunAt` from Module 9's automation module — the exact
///     same cron parser `ScheduledJobRunnerService` uses, cross-module
///     reuse rather than a second implementation).
///  2. Resume every `WorkflowRun` paused at a `delay` step whose
///     `resumeAt` has passed.
@Injectable()
export class WorkflowRunnerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkflowRunnerService.name);
  private intervalHandle: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly executor: WorkflowExecutorService,
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
  /// one replica starts/resumes workflow runs per tick.
  async tick(): Promise<void> {
    await this.leases.withLease(LEASE_NAME, LEASE_TTL_MS, async () => {
      await this.startDueScheduledWorkflows();
      await this.resumeDelayedRuns();
    });
  }

  private async startDueScheduledWorkflows(): Promise<void> {
    const due = await this.prisma.workflow.findMany({
      where: { enabled: true, triggerType: 'SCHEDULE', nextRunAt: { lte: new Date() } },
      take: 50,
    });
    for (const workflow of due) {
      // Module 18 — task #510. Same per-row CAS claim as
      // ScheduledJobRunnerService.runTick() — see its comment for the
      // full race this closes (two replicas both starting a WorkflowRun
      // for the same due workflow if a tick outlives the lease TTL).
      const claim = await this.prisma.workflow.updateMany({
        where: { id: workflow.id, nextRunAt: workflow.nextRunAt },
        data: { nextRunAt: new Date(Date.now() + CLAIM_IN_FLIGHT_MS) },
      });
      if (claim.count === 0) continue;

      try {
        const run = await this.prisma.workflowRun.create({
          data: { workflowId: workflow.id, status: 'PENDING', triggeredBy: null },
        });
        await this.prisma.workflow.update({
          where: { id: workflow.id },
          data: { nextRunAt: workflow.cronExpression ? computeNextRunAt(workflow.cronExpression) : null },
        });
        await this.executor.start(run.id);
      } catch (error) {
        this.logger.error(`Scheduled workflow ${workflow.id} failed to start`, error instanceof Error ? error.stack : String(error));
      }
    }
  }

  private async resumeDelayedRuns(): Promise<void> {
    const due = await this.prisma.workflowRun.findMany({
      where: { status: 'RUNNING', pausedAtStepKey: { not: null }, resumeAt: { lte: new Date() } },
      take: 50,
    });
    for (const run of due) {
      // Module 18 — task #510. `WorkflowExecutorService.resume()` itself
      // reads the run, checks `pausedAtStepKey`, then writes
      // `pausedAtStepKey: null, resumeAt: null` — a plain read-then-write
      // with no guard, so two replicas racing on the same due run could
      // both pass its check before either writes and both advance past
      // the paused step (a duplicate side-effecting step execution, worse
      // than a duplicate scan — this could be a webhook call, an AI
      // request, or a write to another system). CAS-claim the run here,
      // before calling into the executor at all, so only one caller ever
      // reaches `resume()` for a given due `resumeAt`.
      const claim = await this.prisma.workflowRun.updateMany({
        where: { id: run.id, resumeAt: run.resumeAt, pausedAtStepKey: run.pausedAtStepKey },
        data: { resumeAt: new Date(Date.now() + CLAIM_IN_FLIGHT_MS) },
      });
      if (claim.count === 0) continue;

      try {
        await this.executor.resume(run.id);
      } catch (error) {
        this.logger.error(`Failed to resume workflow run ${run.id}`, error instanceof Error ? error.stack : String(error));
      }
    }
  }
}
