import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from '@jest/globals';
import { createRealPrismaService } from '../../../../../test-utils/real-prisma-service.js';
import { createRealTransactionHost } from '../../../../../test-utils/real-prisma-transaction-host.js';
import { PrismaReconJobsRepository } from './prisma-recon-jobs.repository.js';
import type { PrismaService } from '../../../../../prisma/prisma.service.js';

describe('PrismaReconJobsRepository (integration)', () => {
  let prisma: PrismaService;
  let repository: PrismaReconJobsRepository;
  let workspaceId: string;
  let projectId: string;
  let targetId: string;
  let userId: string;
  const email = `itest-recon-jobs-${Date.now()}@example.com`;

  beforeAll(async () => {
    prisma = createRealPrismaService();
    repository = new PrismaReconJobsRepository(
      createRealTransactionHost(prisma),
    );

    const user = await prisma.user.create({
      data: { email, displayName: 'Recon Jobs Fixture', emailVerified: true },
    });
    userId = user.id;
    const workspace = await prisma.workspace.create({
      data: {
        name: 'Recon Jobs Fixture WS',
        slug: `recon-jobs-fixture-ws-${Date.now()}`,
      },
    });
    workspaceId = workspace.id;
    const project = await prisma.project.create({
      data: {
        workspaceId,
        name: 'Recon Jobs Fixture Project',
        createdBy: userId,
      },
    });
    projectId = project.id;
    const target = await prisma.target.create({
      data: {
        projectId,
        type: 'DOMAIN',
        value: 'example.com',
        createdBy: userId,
      },
    });
    targetId = target.id;
  });

  // claimNext is deliberately workspace-agnostic (a real worker claims
  // across every workspace, ORDER BY createdAt ASC), so any PENDING row
  // left over from an earlier `it()` in this same file — or a previous
  // run of this local dev/test database — would be claimed ahead of a
  // later test's own fixture jobs, making claim-ordering assertions
  // non-deterministic. Clearing before every test, not just once, is
  // what makes each test's claim behavior self-contained. Safe here:
  // this points at the local dev pglite instance used only for
  // `pnpm test:integration`, and no other test file touches recon_jobs.
  beforeEach(async () => {
    await prisma.reconJob.deleteMany({
      where: { status: { in: ['PENDING', 'RETRYING'] } },
    });
  });

  afterAll(async () => {
    await prisma.reconJob.deleteMany({ where: { workspaceId } });
    await prisma.target.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { createdBy: userId } });
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it('creates a job with one ReconJobToolRun per requested tool', async () => {
    const job = await repository.create({
      workspaceId,
      projectId,
      targetId,
      tools: ['SUBFINDER', 'DNSX'],
      requestedBy: userId,
      timeoutSeconds: 600,
      maxRetries: 2,
    });

    expect(job.status).toBe('PENDING');
    expect(job.toolRuns).toHaveLength(2);
    expect(job.toolRuns.map((tr) => tr.tool).sort()).toEqual([
      'DNSX',
      'SUBFINDER',
    ]);
  });

  it('claimNext atomically claims one job at a time — concurrent claimers never get the same job (FOR UPDATE SKIP LOCKED)', async () => {
    // claimNext is deliberately workspace-agnostic (a real worker claims
    // across every workspace), so this test doesn't assume it's the only
    // source of PENDING jobs in the shared dev database — it verifies the
    // no-double-claim property (universally true regardless of what else
    // is pending) and then verifies the effect on its OWN two jobs by
    // re-fetching them directly by id, rather than trusting claimNext's
    // return value to necessarily be one of them.
    const jobA = await repository.create({
      workspaceId,
      projectId,
      targetId,
      tools: ['NMAP'],
      requestedBy: userId,
      timeoutSeconds: 600,
      maxRetries: 2,
    });
    const jobB = await repository.create({
      workspaceId,
      projectId,
      targetId,
      tools: ['NMAP'],
      requestedBy: userId,
      timeoutSeconds: 600,
      maxRetries: 2,
    });

    const [claimA, claimB] = await Promise.all([
      repository.claimNext('claimant-a'),
      repository.claimNext('claimant-b'),
    ]);

    expect(claimA).not.toBeNull();
    expect(claimB).not.toBeNull();
    // The two concurrent claimers must land on two DIFFERENT jobs — this
    // is the property that can't be faked with mocks, only proven against
    // a real Postgres connection, and holds regardless of what else is
    // pending in the table.
    expect(claimA!.id).not.toBe(claimB!.id);
    expect(claimA!.status).toBe('RUNNING');

    // Since exactly 2 claims were issued and no other test in this file
    // runs concurrently (--runInBand), both of THIS test's own jobs must
    // now be RUNNING — verified directly, independent of whether
    // claimNext happened to return them or some other pending row.
    const [refetchedA, refetchedB] = await Promise.all([
      prisma.reconJob.findUniqueOrThrow({ where: { id: jobA.id } }),
      prisma.reconJob.findUniqueOrThrow({ where: { id: jobB.id } }),
    ]);
    expect(refetchedA.status).toBe('RUNNING');
    expect(refetchedB.status).toBe('RUNNING');
  });

  it('scheduleRetry sets RETRYING with an incremented retryCount and nextAttemptAt', async () => {
    const job = await repository.create({
      workspaceId,
      projectId,
      targetId,
      tools: ['NAABU'],
      requestedBy: userId,
      timeoutSeconds: 600,
      maxRetries: 2,
    });
    await repository.claimNext(`retry-claimant-${job.id}`);

    const nextAttemptAt = new Date(Date.now() + 5000);
    const retried = await repository.scheduleRetry(job.id, {
      retryCount: 1,
      nextAttemptAt,
      error: 'boom',
    });

    expect(retried.status).toBe('RETRYING');
    expect(retried.retryCount).toBe(1);
    expect(retried.error).toBe('boom');
  });

  it('cancelIfPending only succeeds for a PENDING job and returns null otherwise', async () => {
    const pendingJob = await repository.create({
      workspaceId,
      projectId,
      targetId,
      tools: ['WHATWEB'],
      requestedBy: userId,
      timeoutSeconds: 600,
      maxRetries: 2,
    });
    const cancelled = await repository.cancelIfPending(pendingJob.id);
    expect(cancelled?.status).toBe('CANCELLED');

    const alreadyCancelled = await repository.cancelIfPending(pendingJob.id);
    expect(alreadyCancelled).toBeNull();
  });
});
