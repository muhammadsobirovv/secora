import { describe, expect, it, jest } from '@jest/globals';
import { ClaimNextJobsCommand, ClaimNextJobsHandler } from './distributed-jobs.commands.js';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import type { DistributedJob, WorkerNode } from '../../../prisma-types.js';

/// Module 18 — task #527 (Phase 25: security-critical test hardening).
/// `ClaimNextJobsHandler` is the one place in this codebase where two
/// concurrent Distributed Workers could otherwise both execute the same
/// job — a correctness *and* security-adjacent bug (duplicate execution
/// of, say, a recon/vuln tool run against a target, or double-billing a
/// usage-metered action). The handler's own doc comment (see
/// distributed-jobs.commands.ts) explains the fix: an atomic conditional
/// `updateMany({ where: { id, status: 'QUEUED' } })` per candidate rather
/// than SELECT-then-UPDATE, so a race loser's `updateMany` matches zero
/// rows instead of overwriting a claim that already happened. This had no
/// dedicated test before this phase — this file adds one, covering the
/// three ways that claim logic could silently misbehave: a race loser
/// being (correctly) skipped rather than double-counted, an
/// offline/draining worker getting no work, and claimed count never
/// exceeding the worker's actual available capacity.

function baseWorker(overrides: Partial<WorkerNode> = {}): WorkerNode {
  return {
    id: 'worker-1',
    organizationId: 'org-1',
    name: 'worker-1',
    hostname: 'host-1',
    status: 'ONLINE',
    capabilities: ['RECON_SCAN'],
    maxConcurrency: 5,
    currentLoad: 0,
    registeredAt: new Date('2026-01-01T00:00:00Z'),
    lastHeartbeatAt: new Date('2026-01-01T00:00:00Z'),
    version: '1.0.0',
    ...overrides,
  } as unknown as WorkerNode;
}

function baseCandidate(overrides: Partial<DistributedJob> = {}): DistributedJob {
  return {
    id: 'job-1',
    organizationId: 'org-1',
    workspaceId: 'ws-1',
    type: 'RECON_SCAN',
    payload: {},
    priority: 'NORMAL',
    status: 'QUEUED',
    workerId: null,
    attempts: 0,
    maxAttempts: 3,
    lastError: null,
    scheduledFor: null,
    startedAt: null,
    finishedAt: null,
    requestId: null,
    createdBy: 'user-1',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as unknown as DistributedJob;
}

function buildPrismaMock(overrides: {
  worker: WorkerNode | null;
  candidates: DistributedJob[];
  /// Simulates the race: candidate ids in this set "lose" the atomic
  /// updateMany (another worker claimed them first), so `count` is 0.
  loserIds?: Set<string>;
}) {
  const { worker, candidates, loserIds = new Set<string>() } = overrides;
  const updateManyCalls: Array<{ id: string; status: string }> = [];

  const prisma = {
    workerNode: {
      findUnique: jest.fn().mockResolvedValue(worker),
      update: jest.fn().mockResolvedValue(worker),
    },
    distributedJob: {
      findMany: jest.fn().mockResolvedValue(candidates),
      updateMany: jest.fn((args: { where: { id: string; status: string } }) => {
        updateManyCalls.push(args.where);
        const wouldLose = loserIds.has(args.where.id);
        return Promise.resolve({ count: wouldLose ? 0 : 1 });
      }),
      findUniqueOrThrow: jest.fn((args: { where: { id: string } }) => {
        const candidate = candidates.find((c) => c.id === args.where.id);
        return Promise.resolve({ ...candidate, status: 'ASSIGNED', workerId: worker?.id ?? null });
      }),
    },
    jobEvent: {
      create: jest.fn().mockResolvedValue({}),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as jest.Mocked<PrismaService>;

  return { prisma, updateManyCalls };
}

describe('ClaimNextJobsHandler', () => {
  it('returns no jobs and never queries candidates when the worker is not ONLINE', async () => {
    const worker = baseWorker({ status: 'DRAINING' });
    const { prisma } = buildPrismaMock({ worker, candidates: [] });
    const handler = new ClaimNextJobsHandler(prisma);

    const result = await handler.execute(
      new ClaimNextJobsCommand('user-1', 'worker-1', { capabilities: ['RECON_SCAN'] }),
    );

    expect(result).toEqual([]);
    expect(prisma.distributedJob.findMany).not.toHaveBeenCalled();
  });

  it('returns no jobs when the worker has zero available concurrency slots', async () => {
    const worker = baseWorker({ maxConcurrency: 3, currentLoad: 3 });
    const { prisma } = buildPrismaMock({ worker, candidates: [] });
    const handler = new ClaimNextJobsHandler(prisma);

    const result = await handler.execute(
      new ClaimNextJobsCommand('user-1', 'worker-1', { capabilities: ['RECON_SCAN'] }),
    );

    expect(result).toEqual([]);
    expect(prisma.distributedJob.findMany).not.toHaveBeenCalled();
  });

  it('skips a candidate that loses the atomic claim race instead of counting it as claimed', async () => {
    // Two QUEUED candidates come back from the read, but job-1 has
    // already been claimed by another worker between the read and the
    // write (loserIds simulates that race) — the handler must fall
    // through to job-2 rather than treating job-1 as successfully
    // claimed, and must never claim more than the worker's one free slot.
    const worker = baseWorker({ maxConcurrency: 1, currentLoad: 0 });
    const candidates = [baseCandidate({ id: 'job-1' }), baseCandidate({ id: 'job-2' })];
    const { prisma, updateManyCalls } = buildPrismaMock({
      worker,
      candidates,
      loserIds: new Set(['job-1']),
    });
    const handler = new ClaimNextJobsHandler(prisma);

    const result = await handler.execute(
      new ClaimNextJobsCommand('user-1', 'worker-1', { capabilities: ['RECON_SCAN'] }),
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('job-2');
    // Both candidates were attempted (job-1's loss is why job-2 was tried
    // at all), but only one net job was claimed.
    expect(updateManyCalls.map((c) => c.id)).toEqual(['job-1', 'job-2']);
    // currentLoad only ever advances by the number of jobs *actually*
    // claimed (1), not by how many were attempted (2) — a bug here would
    // silently starve the worker's real available capacity over time.
    expect(prisma.workerNode.update).toHaveBeenCalledWith({
      where: { id: 'worker-1' },
      data: { currentLoad: 1 },
    });
  });

  it('never claims more jobs than the worker has free concurrency for, even if more QUEUED candidates exist', async () => {
    const worker = baseWorker({ maxConcurrency: 5, currentLoad: 4 }); // 1 free slot
    const candidates = [
      baseCandidate({ id: 'job-1' }),
      baseCandidate({ id: 'job-2' }),
      baseCandidate({ id: 'job-3' }),
    ];
    const { prisma } = buildPrismaMock({ worker, candidates });
    const handler = new ClaimNextJobsHandler(prisma);

    const result = await handler.execute(
      new ClaimNextJobsCommand('user-1', 'worker-1', { capabilities: ['RECON_SCAN'], maxJobs: 10 }),
    );

    expect(result).toHaveLength(1);
  });

  it('does not update workerNode.currentLoad at all when nothing was claimed', async () => {
    const worker = baseWorker({ maxConcurrency: 1, currentLoad: 0 });
    const candidates = [baseCandidate({ id: 'job-1' })];
    const { prisma } = buildPrismaMock({ worker, candidates, loserIds: new Set(['job-1']) });
    const handler = new ClaimNextJobsHandler(prisma);

    const result = await handler.execute(
      new ClaimNextJobsCommand('user-1', 'worker-1', { capabilities: ['RECON_SCAN'] }),
    );

    expect(result).toEqual([]);
    expect(prisma.workerNode.update).not.toHaveBeenCalled();
  });
});
