import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../../config/env.validation.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { isWorkerStale } from '../worker-health.util.js';

/// Background poller — dead-worker recovery + job migration. Runs in the
/// worker OS process (see worker.main.ts), the same "controllers only
/// enqueue/read, background loops execute" split every prior module's
/// poller follows (ReconJobPollerService, VulnScanJobPollerService,
/// BugBountyDeadlineNotifierService). Each tick:
///
/// 1. Finds every `ONLINE` `WorkerNode` whose `lastHeartbeatAt` is stale
///    (`isWorkerStale`) and marks it `UNHEALTHY`.
/// 2. For each node that just became `UNHEALTHY` (or already was, from a
///    prior tick that failed to fully migrate its jobs), re-queues every
///    `DistributedJob` still `ASSIGNED`/`RUNNING` on it — status back to
///    `QUEUED`, `workerId` cleared — and records a `MIGRATED` `JobEvent`.
///    A future healthy worker with matching capabilities picks it up via
///    the normal `ClaimNextJobsHandler` path; no special "resume" logic is
///    needed because job payloads are self-contained and idempotent-by-
///    contract (the same assumption Recon/Vuln's own crash-orphan sweep —
///    `ReconJobPollerService.sweepOrphans()` — already makes).
///
/// Known, disclosed limitation (Module 18 — task #510): "idempotent-by-
/// contract" here means re-running a migrated job's handler is *safe*
/// (won't corrupt state or duplicate DB rows — handlers upsert/key on the
/// job's own deterministic outputs), not that it has *no externally
/// visible side effects*. If a worker crashes after it already sent a
/// request to an external system — kicked off a real network scan against
/// a target, called a paid AI API, hit a third-party rate limit, posted a
/// webhook — this migration path (and the equivalent Recon/Vuln orphan
/// sweeps) will re-run that handler from scratch on a new worker, which
/// re-issues that external action a second time. There is no
/// idempotency-key / dedup-token layer at the ToolRunner or AI-provider
/// call boundary that would let a re-run detect "this exact external
/// action already happened, don't repeat it." Closing that fully would
/// mean threading a stable idempotency key through every external call
/// site (ToolRunner, AiProvider adapters, webhook dispatch) and having
/// each provider honor it — a cross-cutting change to the tool/AI-calling
/// path itself, out of proportion to this phase's job-queue-races scope.
/// Accepted as a known gap; see docs/operations/ (Module 18 Phase 29) for
/// the tracked follow-up.
@Injectable()
export class WorkerReaperService {
  private readonly logger = new Logger(WorkerReaperService.name);
  private stopped = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  async start(): Promise<void> {
    this.logger.log('Worker reaper started');
    await this.tick();
  }

  stop(): void {
    this.stopped = true;
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;
    const pollInterval = this.configService.get('WORKER_REAPER_POLL_INTERVAL_MS', { infer: true });
    const staleMs = this.configService.get('WORKER_HEARTBEAT_STALE_MS', { infer: true });

    try {
      await this.markStaleWorkersUnhealthy(staleMs);
      await this.migrateOrphanedJobs();
    } catch (error) {
      this.logger.error('Worker reaper tick failed', error);
    }

    setTimeout(() => void this.tick(), pollInterval);
  }

  private async markStaleWorkersUnhealthy(staleMs: number): Promise<void> {
    const candidates = await this.prisma.workerNode.findMany({
      where: { status: { in: ['ONLINE', 'DRAINING'] } },
    });
    const stale = candidates.filter((w) => isWorkerStale(w, staleMs));
    if (stale.length === 0) return;

    await this.prisma.workerNode.updateMany({
      where: { id: { in: stale.map((w) => w.id) } },
      data: { status: 'UNHEALTHY' },
    });
    this.logger.warn(`Marked ${stale.length} worker node(s) UNHEALTHY (stale heartbeat)`);
  }

  private async migrateOrphanedJobs(): Promise<void> {
    const unhealthyWorkers = await this.prisma.workerNode.findMany({ where: { status: 'UNHEALTHY' } });
    if (unhealthyWorkers.length === 0) return;

    for (const worker of unhealthyWorkers) {
      // Module 18 — task #510 (job queue hardening). This used to be a
      // `findMany` (read the orphaned ids) followed by a separate
      // `updateMany` keyed only on those ids, with no status guard on the
      // write. That's a TOCTOU race: if the "unhealthy" worker was
      // actually still alive and finished the job (SUCCEEDED/FAILED)
      // in the window between the read and the write, this would
      // silently reset an already-completed job back to QUEUED and cause
      // it to be re-executed from scratch — duplicate scans, duplicate
      // downstream side effects. A single atomic `UPDATE ... RETURNING`
      // closes the window entirely (same "claim via one atomic statement"
      // pattern `PrismaReconJobsRepository.claimNext()` already uses) —
      // the WHERE clause re-checks status at write time, so only jobs
      // genuinely still ASSIGNED/RUNNING get migrated, and the RETURNING
      // clause tells us exactly which ones for the JobEvent audit trail
      // below (rather than assuming the pre-read set is still accurate).
      const migrated = await this.prisma.$queryRaw<{ id: string }[]>`
        UPDATE "distributed_jobs"
        SET status = 'QUEUED', "workerId" = NULL, "startedAt" = NULL, "updatedAt" = now()
        WHERE "workerId" = ${worker.id}
          AND status IN ('ASSIGNED', 'RUNNING')
        RETURNING id;
      `;
      if (migrated.length === 0) continue;

      await this.prisma.jobEvent.createMany({
        data: migrated.map((j) => ({
          jobId: j.id,
          workerId: worker.id,
          type: 'MIGRATED' as const,
          message: `Migrated off unhealthy worker ${worker.id} (stale heartbeat)`,
        })),
      });
      await this.prisma.workerNode.update({ where: { id: worker.id }, data: { currentLoad: 0 } });
      this.logger.warn(`Migrated ${migrated.length} job(s) off unhealthy worker ${worker.id}`);
    }
  }
}
