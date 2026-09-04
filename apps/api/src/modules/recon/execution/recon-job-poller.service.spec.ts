import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ReconJobPollerService } from './recon-job-poller.service.js';
import type { ReconJobExecutionService } from './recon-job-execution.service.js';
import type { ReconJobsRepository } from '../domain/repositories/recon-jobs.repository.interface.js';
import type { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../../config/env.validation.js';
import type { ReconJob } from '../../../prisma-types.js';

/// Module 18 — task #529 (Phase 27: disaster/failure-mode tests).
/// `ReconJobPollerService.sweepOrphans()` is the recon-side analog of
/// `WorkerReaperService`'s job migration (see that file's own spec) —
/// the recovery path for "the worker process that claimed this job died
/// mid-run" (crash, OOM, `kill -9`, host eviction). It had no dedicated
/// test despite its own doc comment describing a real regression it was
/// hardened against (task #510): orphan recovery used to re-queue a
/// crash-looping job for *immediate* retry with no backoff, so a target
/// that reliably OOMs a scanner would retry in a tight loop instead of
/// backing off. This suite exercises both branches of that recovery
/// decision (retry-with-backoff vs. give-up) plus the guard against
/// double-handling a job this same process still has in flight.

function buildJob(overrides: Partial<ReconJob> = {}): ReconJob {
  return {
    id: 'job-1',
    workspaceId: 'ws-1',
    projectId: 'proj-1',
    targetId: 'target-1',
    status: 'RUNNING',
    retryCount: 0,
    maxRetries: 3,
    timeoutSeconds: 300,
    cancelRequestedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as unknown as ReconJob;
}

function buildConfig(overrides: Partial<Record<string, number>> = {}) {
  const values: Record<string, number> = {
    RECON_WORKER_POLL_INTERVAL_MS: 5000,
    RECON_WORKER_CONCURRENCY: 2,
    RECON_JOB_TIMEOUT_SECONDS: 300,
    RECON_WORKER_ORPHAN_SWEEP_INTERVAL_MS: 60_000,
    RECON_JOB_RETRY_BASE_DELAY_MS: 1000,
    RECON_JOB_RETRY_MAX_DELAY_MS: 60_000,
    ...overrides,
  };
  return { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService<EnvConfig, true>;
}

describe('ReconJobPollerService — orphan recovery (disaster: worker process died mid-job)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('schedules a backed-off retry for an orphaned job still under its retry budget', async () => {
    const orphan = buildJob({ id: 'job-orphan-1', retryCount: 0, maxRetries: 3 });
    const scheduleRetry = jest.fn().mockResolvedValue(orphan);
    const jobsRepository = {
      findOrphaned: jest.fn<ReconJobsRepository['findOrphaned']>().mockResolvedValue([orphan]),
      claimNext: jest.fn<ReconJobsRepository['claimNext']>().mockResolvedValue(null),
      findById: jest.fn<ReconJobsRepository['findById']>().mockResolvedValue(null),
      scheduleRetry: scheduleRetry as unknown as ReconJobsRepository['scheduleRetry'],
      markFailed: jest.fn<ReconJobsRepository['markFailed']>().mockResolvedValue(orphan),
    } as unknown as jest.Mocked<ReconJobsRepository>;
    const executionService = {} as ReconJobExecutionService;

    const poller = new ReconJobPollerService(jobsRepository, executionService, buildConfig());
    await poller.start();
    poller.stop();

    expect(scheduleRetry).toHaveBeenCalledTimes(1);
    const [id, input] = scheduleRetry.mock.calls[0] as [string, { retryCount: number; nextAttemptAt: Date; error: string }];
    expect(id).toBe('job-orphan-1');
    expect(input.retryCount).toBe(1);
    // Must be scheduled strictly in the future (backoff), never
    // immediate — the exact regression task #510 fixed.
    expect(input.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    expect(input.error).toMatch(/worker process lost/i);
  });

  it('marks the job FAILED (not scheduled for retry) once its retry budget is exhausted', async () => {
    const orphan = buildJob({ id: 'job-orphan-2', retryCount: 3, maxRetries: 3 });
    const markFailed = jest.fn().mockResolvedValue(orphan);
    const scheduleRetry = jest.fn();
    const jobsRepository = {
      findOrphaned: jest.fn<ReconJobsRepository['findOrphaned']>().mockResolvedValue([orphan]),
      claimNext: jest.fn<ReconJobsRepository['claimNext']>().mockResolvedValue(null),
      findById: jest.fn<ReconJobsRepository['findById']>().mockResolvedValue(null),
      scheduleRetry: scheduleRetry as unknown as ReconJobsRepository['scheduleRetry'],
      markFailed: markFailed as unknown as ReconJobsRepository['markFailed'],
    } as unknown as jest.Mocked<ReconJobsRepository>;
    const executionService = {} as ReconJobExecutionService;

    const poller = new ReconJobPollerService(jobsRepository, executionService, buildConfig());
    await poller.start();
    poller.stop();

    expect(markFailed).toHaveBeenCalledWith('job-orphan-2', expect.stringMatching(/retries exhausted/i));
    expect(scheduleRetry).not.toHaveBeenCalled();
  });

  it('skips a job findOrphaned returns if this same process still has it tracked as running (not actually orphaned)', async () => {
    // This can legitimately happen: findOrphaned's cutoff is time-based,
    // and a slow-but-alive job on *this* process could theoretically
    // match the same window a genuinely-dead worker's job would. The
    // `running` map is this process's own source of truth for "is this
    // actually mine and still going," and must win over the orphan sweep.
    const stillRunningHere = buildJob({ id: 'job-not-orphan', retryCount: 0, maxRetries: 3 });
    const scheduleRetry = jest.fn();
    const markFailed = jest.fn();
    const jobsRepository = {
      // Tick 1: nothing orphaned yet (findOrphaned's cutoff hasn't caught
      // up with this job) — it gets claimed and starts "running" instead.
      // Tick 2: findOrphaned now returns it too (simulating the cutoff
      // window catching up while it's still genuinely in flight here) —
      // the `running` map guard must be what stops it from being treated
      // as a real orphan, not the findOrphaned query itself.
      findOrphaned: jest
        .fn<ReconJobsRepository['findOrphaned']>()
        .mockResolvedValueOnce([])
        .mockResolvedValue([stillRunningHere]),
      claimNext: jest
        .fn<ReconJobsRepository['claimNext']>()
        .mockResolvedValueOnce(stillRunningHere)
        .mockResolvedValue(null),
      findById: jest
        .fn<ReconJobsRepository['findById']>()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockResolvedValueOnce({ ...stillRunningHere, toolRuns: [] } as any)
        .mockResolvedValue(null),
      scheduleRetry: scheduleRetry as unknown as ReconJobsRepository['scheduleRetry'],
      markFailed: markFailed as unknown as ReconJobsRepository['markFailed'],
    } as unknown as jest.Mocked<ReconJobsRepository>;
    const executionService = {
      execute: jest.fn(() => new Promise<void>(() => {})), // never resolves — stays "running"
    } as unknown as ReconJobExecutionService;

    const poller = new ReconJobPollerService(jobsRepository, executionService, buildConfig());

    await poller.start(); // tick 1: claims job-not-orphan, starts "running" it (never resolves)
    await jest.advanceTimersByTimeAsync(5000); // tick 2: sweepOrphans now sees it in findOrphaned too
    poller.stop();

    expect(scheduleRetry).not.toHaveBeenCalled();
    expect(markFailed).not.toHaveBeenCalled();
  });

  it('keeps polling on the next tick even when a tick throws (poller resilience)', async () => {
    let callCount = 0;
    const jobsRepository = {
      findOrphaned: jest.fn(() => {
        callCount += 1;
        if (callCount === 1) return Promise.reject(new Error('DB connection lost'));
        return Promise.resolve([]);
      }) as unknown as ReconJobsRepository['findOrphaned'],
      claimNext: jest.fn<ReconJobsRepository['claimNext']>().mockResolvedValue(null),
      findById: jest.fn<ReconJobsRepository['findById']>().mockResolvedValue(null),
      scheduleRetry: jest.fn() as unknown as ReconJobsRepository['scheduleRetry'],
      markFailed: jest.fn() as unknown as ReconJobsRepository['markFailed'],
    } as unknown as jest.Mocked<ReconJobsRepository>;
    const executionService = {} as ReconJobExecutionService;

    const poller = new ReconJobPollerService(jobsRepository, executionService, buildConfig({ RECON_WORKER_POLL_INTERVAL_MS: 1000 }));
    await expect(poller.start()).resolves.toBeUndefined();
    await jest.advanceTimersByTimeAsync(1000);
    poller.stop();

    expect(callCount).toBeGreaterThanOrEqual(2);
  });
});
