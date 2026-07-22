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
      const orphaned = await this.prisma.distributedJob.findMany({
        where: { workerId: worker.id, status: { in: ['ASSIGNED', 'RUNNING'] } },
      });
      if (orphaned.length === 0) continue;

      await this.prisma.distributedJob.updateMany({
        where: { id: { in: orphaned.map((j) => j.id) } },
        data: { status: 'QUEUED', workerId: null, startedAt: null },
      });
      await this.prisma.jobEvent.createMany({
        data: orphaned.map((j) => ({
          jobId: j.id,
          workerId: worker.id,
          type: 'MIGRATED' as const,
          message: `Migrated off unhealthy worker ${worker.id} (stale heartbeat)`,
        })),
      });
      await this.prisma.workerNode.update({ where: { id: worker.id }, data: { currentLoad: 0 } });
      this.logger.warn(`Migrated ${orphaned.length} job(s) off unhealthy worker ${worker.id}`);
    }
  }
}
