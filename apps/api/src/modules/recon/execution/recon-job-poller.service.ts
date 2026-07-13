import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import type { EnvConfig } from '../../../config/env.validation.js';
import {
  RECON_JOBS_REPOSITORY,
  type ReconJobsRepository,
} from '../domain/repositories/recon-jobs.repository.interface.js';
import { ReconJobExecutionService } from './recon-job-execution.service.js';

interface RunningJob {
  controller: AbortController;
  promise: Promise<void>;
}

/// Owns the process-level concerns ReconJobExecutionService deliberately
/// doesn't: which job to run next (claim), how many run at once
/// (concurrency cap), when to give up on one (timeout, via AbortController
/// + setTimeout), and how a user-requested cancel actually reaches a
/// running job's subprocess (this poll loop is what notices
/// cancelRequestedAt and calls .abort() — see docs/adr/0003, "Timeout +
/// cancellation share one mechanism"). Runs as a recursive setTimeout loop
/// rather than setInterval so a slow tick can't pile up overlapping runs.
@Injectable()
export class ReconJobPollerService {
  private readonly logger = new Logger(ReconJobPollerService.name);
  private readonly claimantId = `${hostname()}:${process.pid}:${randomUUID()}`;
  private readonly running = new Map<string, RunningJob>();
  private stopped = false;

  constructor(
    @Inject(RECON_JOBS_REPOSITORY)
    private readonly jobsRepository: ReconJobsRepository,
    private readonly executionService: ReconJobExecutionService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  async start(): Promise<void> {
    this.logger.log(`Recon worker started (claimant ${this.claimantId})`);
    await this.tick();
  }

  stop(): void {
    this.stopped = true;
    for (const { controller } of this.running.values()) controller.abort();
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;
    const pollInterval = this.configService.get(
      'RECON_WORKER_POLL_INTERVAL_MS',
      {
        infer: true,
      },
    );

    try {
      await this.checkCancellations();
      await this.sweepOrphans();
      await this.claimAvailableSlots();
    } catch (error) {
      this.logger.error('Poller tick failed', error);
    }

    setTimeout(() => void this.tick(), pollInterval);
  }

  private async claimAvailableSlots(): Promise<void> {
    const concurrency = this.configService.get('RECON_WORKER_CONCURRENCY', {
      infer: true,
    });
    while (this.running.size < concurrency) {
      const claimed = await this.jobsRepository.claimNext(this.claimantId);
      if (!claimed) return;

      const job = await this.jobsRepository.findById(claimed.id);
      if (!job) continue;

      const controller = new AbortController();
      const timeoutTimer = setTimeout(
        () => controller.abort(),
        job.timeoutSeconds * 1000,
      );
      const promise = this.executionService
        .execute(job, controller.signal)
        .catch((error: unknown) =>
          this.logger.error(`Unhandled error running job ${job.id}`, error),
        )
        .finally(() => {
          clearTimeout(timeoutTimer);
          this.running.delete(job.id);
        });

      this.running.set(job.id, { controller, promise });
    }
  }

  private async checkCancellations(): Promise<void> {
    for (const [jobId, { controller }] of this.running) {
      if (controller.signal.aborted) continue;
      const job = await this.jobsRepository.findById(jobId);
      if (job?.cancelRequestedAt) controller.abort();
    }
  }

  private async sweepOrphans(): Promise<void> {
    const timeoutSeconds = this.configService.get('RECON_JOB_TIMEOUT_SECONDS', {
      infer: true,
    });
    const graceMs = this.configService.get(
      'RECON_WORKER_ORPHAN_SWEEP_INTERVAL_MS',
      {
        infer: true,
      },
    );
    const cutoff = new Date(Date.now() - timeoutSeconds * 1000 - graceMs);
    const orphaned = await this.jobsRepository.findOrphaned(cutoff);
    for (const job of orphaned) {
      // Not tracked in `running` on this process (a different, presumably
      // dead, worker claimed it) — route it through the same retry/fail
      // budget as any other failure rather than a bespoke path.
      if (this.running.has(job.id)) continue;
      this.logger.warn(`Recovering orphaned job ${job.id}`);
      if (job.retryCount < job.maxRetries) {
        await this.jobsRepository.scheduleRetry(job.id, {
          retryCount: job.retryCount + 1,
          nextAttemptAt: new Date(),
          error: 'Worker process lost while job was running.',
        });
      } else {
        await this.jobsRepository.markFailed(
          job.id,
          'Worker process lost while job was running; retries exhausted.',
        );
      }
    }
  }
}
