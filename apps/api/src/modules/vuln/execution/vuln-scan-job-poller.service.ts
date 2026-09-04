import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import type { EnvConfig } from '../../../config/env.validation.js';
import {
  VULN_SCAN_JOBS_REPOSITORY,
  type VulnScanJobsRepository,
} from '../domain/repositories/vuln-scan-jobs.repository.interface.js';
import { VulnScanJobExecutionService } from './vuln-scan-job-execution.service.js';

interface RunningJob {
  controller: AbortController;
  promise: Promise<void>;
  lastHeartbeatSentAt: number;
}

/// Owns the process-level concerns VulnScanJobExecutionService
/// deliberately doesn't — mirrors ReconJobPollerService (Module 3)
/// exactly, plus two additions the spec's Job System calls for that
/// Module 3 never needed:
///
/// - Worker Heartbeat / Dead Worker Recovery: while a job is RUNNING this
///   poller writes VulnScanJob.lastHeartbeatAt on a slower cadence
///   (VULN_WORKER_HEARTBEAT_INTERVAL_MS) than the poll loop itself, and
///   sweepOrphans() reclaims any RUNNING job whose heartbeat has gone
///   stale (VULN_WORKER_HEARTBEAT_TIMEOUT_MS) — a strictly more accurate
///   signal of "is the worker that claimed this job still alive" than
///   Module 3's claimedAt-age-only sweep, since it keeps refreshing for
///   the entire (long) duration of a scan rather than going stale the
///   instant claimedAt passes the job's own timeout window.
/// - Priority: claimNext (VulnScanJobsRepository) orders by priority DESC
///   before createdAt ASC.
///
/// Pause is NOT handled here via AbortController — see
/// VulnScanJobExecutionService, which polls pauseRequestedAt directly
/// between scanners instead of aborting a running one (graceful, unlike
/// cancel/timeout).
@Injectable()
export class VulnScanJobPollerService {
  private readonly logger = new Logger(VulnScanJobPollerService.name);
  private readonly claimantId = `${hostname()}:${process.pid}:${randomUUID()}`;
  private readonly running = new Map<string, RunningJob>();
  private stopped = false;

  constructor(
    @Inject(VULN_SCAN_JOBS_REPOSITORY)
    private readonly jobsRepository: VulnScanJobsRepository,
    private readonly executionService: VulnScanJobExecutionService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  async start(): Promise<void> {
    this.logger.log(
      `Vulnerability worker started (claimant ${this.claimantId})`,
    );
    await this.tick();
  }

  stop(): void {
    this.stopped = true;
    for (const { controller } of this.running.values()) controller.abort();
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;
    const pollInterval = this.configService.get(
      'VULN_WORKER_POLL_INTERVAL_MS',
      {
        infer: true,
      },
    );

    try {
      await this.checkCancellations();
      await this.sendHeartbeats();
      await this.sweepOrphans();
      await this.claimAvailableSlots();
    } catch (error) {
      this.logger.error('Poller tick failed', error);
    }

    setTimeout(() => void this.tick(), pollInterval);
  }

  private async claimAvailableSlots(): Promise<void> {
    const concurrency = this.configService.get('VULN_WORKER_CONCURRENCY', {
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

      this.running.set(job.id, {
        controller,
        promise,
        lastHeartbeatSentAt: Date.now(),
      });
    }
  }

  private async checkCancellations(): Promise<void> {
    for (const [jobId, { controller }] of this.running) {
      if (controller.signal.aborted) continue;
      const job = await this.jobsRepository.findById(jobId);
      if (job?.cancelRequestedAt) controller.abort();
    }
  }

  private async sendHeartbeats(): Promise<void> {
    const heartbeatIntervalMs = this.configService.get(
      'VULN_WORKER_HEARTBEAT_INTERVAL_MS',
      { infer: true },
    );
    const now = Date.now();
    for (const [jobId, running] of this.running) {
      if (now - running.lastHeartbeatSentAt < heartbeatIntervalMs) continue;
      await this.jobsRepository.recordHeartbeat(jobId);
      running.lastHeartbeatSentAt = now;
    }
  }

  private async sweepOrphans(): Promise<void> {
    const heartbeatTimeoutMs = this.configService.get(
      'VULN_WORKER_HEARTBEAT_TIMEOUT_MS',
      { infer: true },
    );
    const cutoff = new Date(Date.now() - heartbeatTimeoutMs);
    const orphaned = await this.jobsRepository.findOrphaned(cutoff);
    for (const job of orphaned) {
      // Not tracked in `running` on this process (a different, presumably
      // dead, worker claimed it) — route it through the same retry/fail
      // budget as any other failure rather than a bespoke path.
      if (this.running.has(job.id)) continue;
      this.logger.warn(
        `Recovering orphaned vuln scan job ${job.id} (dead worker)`,
      );
      if (job.retryCount < job.maxRetries) {
        // Module 18 — task #510 (job queue hardening). Same fix as
        // ReconJobPollerService's sibling orphan-sweep path — was an
        // immediate `nextAttemptAt: new Date()`, now reuses
        // `VulnScanJobExecutionService.retryOrFail()`'s own exponential-
        // backoff + jitter formula so a repeatedly-crashing job doesn't
        // tight-loop through its retry budget.
        const baseDelay = this.configService.get('VULN_JOB_RETRY_BASE_DELAY_MS', { infer: true });
        const maxDelay = this.configService.get('VULN_JOB_RETRY_MAX_DELAY_MS', { infer: true });
        const retryCount = job.retryCount + 1;
        const backoff = Math.min(baseDelay * 2 ** retryCount, maxDelay);
        const jitter = Math.random() * 2000;
        await this.jobsRepository.scheduleRetry(job.id, {
          retryCount,
          nextAttemptAt: new Date(Date.now() + backoff + jitter),
          error:
            'Worker process lost while job was running (heartbeat timeout).',
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
