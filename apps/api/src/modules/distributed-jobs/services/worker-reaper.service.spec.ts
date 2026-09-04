import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { WorkerReaperService } from './worker-reaper.service.js';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import type { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../../config/env.validation.js';
import type { WorkerNode } from '../../../prisma-types.js';

/// Module 18 — task #529 (Phase 27: disaster/failure-mode tests).
/// `WorkerReaperService` is this codebase's dead-worker-detection and
/// job-migration path — the thing that actually runs when a Distributed
/// Worker process crashes or loses network mid-job. It had no dedicated
/// test before this phase despite its own doc comments describing a
/// TOCTOU race it was specifically hardened against (task #510): a naive
/// read-then-write job migration could silently reset an
/// already-completed job back to QUEUED and cause a duplicate re-run.
/// This suite exercises the actual disaster scenario end to end: a
/// worker's heartbeat goes stale, gets marked UNHEALTHY, and its
/// in-flight jobs get migrated back to QUEUED via the atomic
/// `UPDATE ... RETURNING` — plus the "tick keeps polling even after an
/// error" resilience property the poller loop depends on.

function buildWorker(overrides: Partial<WorkerNode> = {}): WorkerNode {
  return {
    id: 'worker-1',
    organizationId: 'org-1',
    name: 'worker-1',
    hostname: 'host-1',
    status: 'ONLINE',
    capabilities: ['RECON_SCAN'],
    maxConcurrency: 5,
    currentLoad: 2,
    registeredAt: new Date('2026-01-01T00:00:00Z'),
    lastHeartbeatAt: new Date('2026-01-01T00:00:00Z'),
    version: '1.0.0',
    ...overrides,
  } as unknown as WorkerNode;
}

function buildConfig(overrides: { pollIntervalMs?: number; staleMs?: number } = {}) {
  const values: Record<string, number> = {
    WORKER_REAPER_POLL_INTERVAL_MS: overrides.pollIntervalMs ?? 30_000,
    WORKER_HEARTBEAT_STALE_MS: overrides.staleMs ?? 90_000,
  };
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService<EnvConfig, true>;
}

describe('WorkerReaperService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('marks a worker with a stale heartbeat UNHEALTHY and leaves a fresh one ONLINE', async () => {
    // "Now" is fixed via the stale threshold math below — worker-1's
    // heartbeat is far enough in the past to exceed the 90s default
    // stale window; worker-2's is recent.
    const stale = buildWorker({ id: 'worker-1', lastHeartbeatAt: new Date(Date.now() - 10 * 60_000) });
    const fresh = buildWorker({ id: 'worker-2', lastHeartbeatAt: new Date() });

    const updateManyWorkerNode = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      workerNode: {
        findMany: jest.fn((args: { where: { status: { in: string[] } } }) => {
          if (args.where.status.in.includes('ONLINE')) return Promise.resolve([stale, fresh]);
          return Promise.resolve([]); // no UNHEALTHY workers yet this tick
        }),
        updateMany: updateManyWorkerNode,
        update: jest.fn().mockResolvedValue({}),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
      jobEvent: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any as jest.Mocked<PrismaService>;

    const service = new WorkerReaperService(prisma, buildConfig());
    await service.start();
    service.stop();

    expect(updateManyWorkerNode).toHaveBeenCalledWith({
      where: { id: ['worker-1'] },
      data: { status: 'UNHEALTHY' },
    });
  });

  it('does not touch workerNode.updateMany at all when no worker is stale', async () => {
    const fresh = buildWorker({ id: 'worker-1', lastHeartbeatAt: new Date() });
    const updateManyWorkerNode = jest.fn().mockResolvedValue({ count: 0 });
    const prisma = {
      workerNode: {
        findMany: jest.fn((args: { where: { status: { in: string[] } } }) =>
          Promise.resolve(args.where.status.in.includes('ONLINE') ? [fresh] : []),
        ),
        updateMany: updateManyWorkerNode,
        update: jest.fn().mockResolvedValue({}),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
      jobEvent: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any as jest.Mocked<PrismaService>;

    const service = new WorkerReaperService(prisma, buildConfig());
    await service.start();
    service.stop();

    expect(updateManyWorkerNode).not.toHaveBeenCalled();
  });

  it('migrates ASSIGNED/RUNNING jobs off an UNHEALTHY worker via the atomic UPDATE...RETURNING, records MIGRATED events, and zeroes currentLoad', async () => {
    const unhealthyWorker = buildWorker({ id: 'worker-dead', status: 'UNHEALTHY', currentLoad: 3 });
    const migratedRows = [{ id: 'job-1' }, { id: 'job-2' }];

    const queryRaw = jest.fn().mockResolvedValue(migratedRows);
    const createManyJobEvent = jest.fn().mockResolvedValue({ count: 2 });
    const updateWorkerNode = jest.fn().mockResolvedValue({});
    const prisma = {
      workerNode: {
        findMany: jest.fn((args: { where: { status: string | { in: string[] } } }) => {
          if (typeof args.where.status === 'object' && 'in' in args.where.status) return Promise.resolve([]); // no ONLINE/DRAINING candidates this tick
          if (args.where.status === 'UNHEALTHY') return Promise.resolve([unhealthyWorker]);
          return Promise.resolve([]);
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: updateWorkerNode,
      },
      $queryRaw: queryRaw,
      jobEvent: { createMany: createManyJobEvent },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any as jest.Mocked<PrismaService>;

    const service = new WorkerReaperService(prisma, buildConfig());
    await service.start();
    service.stop();

    // The migration query is a single atomic statement, not a
    // findMany()-then-updateMany() pair — this is the specific fix for
    // the disclosed TOCTOU race (task #510): re-checking status IN
    // (ASSIGNED, RUNNING) at write time inside the same statement that
    // performs the write.
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(createManyJobEvent).toHaveBeenCalledWith({
      data: [
        { jobId: 'job-1', workerId: 'worker-dead', type: 'MIGRATED', message: expect.stringContaining('worker-dead') },
        { jobId: 'job-2', workerId: 'worker-dead', type: 'MIGRATED', message: expect.stringContaining('worker-dead') },
      ],
    });
    expect(updateWorkerNode).toHaveBeenCalledWith({
      where: { id: 'worker-dead' },
      data: { currentLoad: 0 },
    });
  });

  it('does not record a MIGRATED event or reset currentLoad when the atomic migration query returns zero rows (nothing was actually still assigned to it)', async () => {
    // Simulates the exact race the atomic query guards against: by the
    // time this UNHEALTHY worker's jobs are checked, they'd already
    // completed (status no longer ASSIGNED/RUNNING) — the RETURNING
    // clause correctly comes back empty, and the handler must not act as
    // if a migration happened.
    const unhealthyWorker = buildWorker({ id: 'worker-dead', status: 'UNHEALTHY' });
    const createManyJobEvent = jest.fn().mockResolvedValue({ count: 0 });
    const updateWorkerNode = jest.fn().mockResolvedValue({});
    const prisma = {
      workerNode: {
        findMany: jest.fn((args: { where: { status: string | { in: string[] } } }) => {
          if (typeof args.where.status === 'object' && 'in' in args.where.status) return Promise.resolve([]);
          if (args.where.status === 'UNHEALTHY') return Promise.resolve([unhealthyWorker]);
          return Promise.resolve([]);
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: updateWorkerNode,
      },
      $queryRaw: jest.fn().mockResolvedValue([]), // nothing to migrate
      jobEvent: { createMany: createManyJobEvent },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any as jest.Mocked<PrismaService>;

    const service = new WorkerReaperService(prisma, buildConfig());
    await service.start();
    service.stop();

    expect(createManyJobEvent).not.toHaveBeenCalled();
    expect(updateWorkerNode).not.toHaveBeenCalled();
  });

  it('keeps polling on the next tick even when a tick throws (poller resilience — one bad tick must not kill the loop)', async () => {
    let callCount = 0;
    const prisma = {
      workerNode: {
        findMany: jest.fn(() => {
          callCount += 1;
          if (callCount === 1) return Promise.reject(new Error('DB connection lost'));
          return Promise.resolve([]);
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn().mockResolvedValue({}),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
      jobEvent: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any as jest.Mocked<PrismaService>;

    const service = new WorkerReaperService(prisma, buildConfig({ pollIntervalMs: 1000 }));
    // start() awaits exactly one tick — the first, throwing, one. The
    // service must not itself throw (the reaper's own try/catch inside
    // tick() is what makes this a resilience property worth testing).
    await expect(service.start()).resolves.toBeUndefined();

    // Advance past the scheduled next tick to confirm the loop actually
    // continues rather than dying silently after the failed attempt.
    await jest.advanceTimersByTimeAsync(1000);
    service.stop();

    expect(callCount).toBeGreaterThanOrEqual(2);
  });
});
