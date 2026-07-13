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
import { PrismaVulnScanJobsRepository } from './prisma-vuln-scan-jobs.repository.js';
import type { PrismaService } from '../../../../../prisma/prisma.service.js';

describe('PrismaVulnScanJobsRepository (integration)', () => {
  let prisma: PrismaService;
  let repository: PrismaVulnScanJobsRepository;
  let workspaceId: string;
  let projectId: string;
  let targetId: string;
  let userId: string;
  const email = `itest-vuln-jobs-${Date.now()}@example.com`;

  beforeAll(async () => {
    prisma = createRealPrismaService();
    repository = new PrismaVulnScanJobsRepository(
      createRealTransactionHost(prisma),
    );

    const user = await prisma.user.create({
      data: { email, displayName: 'Vuln Jobs Fixture', emailVerified: true },
    });
    userId = user.id;
    const workspace = await prisma.workspace.create({
      data: {
        name: 'Vuln Jobs Fixture WS',
        slug: `vuln-jobs-fixture-ws-${Date.now()}`,
      },
    });
    workspaceId = workspace.id;
    const project = await prisma.project.create({
      data: {
        workspaceId,
        name: 'Vuln Jobs Fixture Project',
        createdBy: userId,
      },
    });
    projectId = project.id;
    const target = await prisma.target.create({
      data: {
        projectId,
        type: 'URL',
        value: 'https://example.com',
        createdBy: userId,
      },
    });
    targetId = target.id;
  });

  // Same rationale as Module 3's equivalent comment: claimNext is
  // workspace-agnostic, so a leftover PENDING/RETRYING row from an
  // earlier test would make claim-ordering assertions non-deterministic.
  beforeEach(async () => {
    await prisma.vulnScanJob.deleteMany({
      where: { status: { in: ['PENDING', 'RETRYING'] } },
    });
  });

  afterAll(async () => {
    await prisma.vulnScanJob.deleteMany({ where: { workspaceId } });
    await prisma.target.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { createdBy: userId } });
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it('creates a job with one VulnScanJobToolRun per requested scanner', async () => {
    const job = await repository.create({
      workspaceId,
      projectId,
      targetId,
      scanners: ['NUCLEI', 'FFUF'],
      templateId: null,
      config: null,
      priority: 0,
      requestedBy: userId,
      timeoutSeconds: 1800,
      maxRetries: 2,
    });

    expect(job.status).toBe('PENDING');
    expect(job.toolRuns).toHaveLength(2);
    expect(job.toolRuns.map((tr) => tr.scanner).sort()).toEqual([
      'FFUF',
      'NUCLEI',
    ]);
  });

  it('claimNext orders by priority DESC before createdAt ASC', async () => {
    const low = await repository.create({
      workspaceId,
      projectId,
      targetId,
      scanners: ['NUCLEI'],
      templateId: null,
      config: null,
      priority: 0,
      requestedBy: userId,
      timeoutSeconds: 1800,
      maxRetries: 2,
    });
    await new Promise((r) => setTimeout(r, 10));
    const high = await repository.create({
      workspaceId,
      projectId,
      targetId,
      scanners: ['NUCLEI'],
      templateId: null,
      config: null,
      priority: 10,
      requestedBy: userId,
      timeoutSeconds: 1800,
      maxRetries: 2,
    });
    void low;

    const claimed = await repository.claimNext('priority-claimant');
    // The later-created but higher-priority job must be claimed first.
    expect(claimed?.id).toBe(high.id);
  });

  it('claimNext atomically claims one job at a time (FOR UPDATE SKIP LOCKED)', async () => {
    const jobA = await repository.create({
      workspaceId,
      projectId,
      targetId,
      scanners: ['NUCLEI'],
      templateId: null,
      config: null,
      priority: 0,
      requestedBy: userId,
      timeoutSeconds: 1800,
      maxRetries: 2,
    });
    const jobB = await repository.create({
      workspaceId,
      projectId,
      targetId,
      scanners: ['NUCLEI'],
      templateId: null,
      config: null,
      priority: 0,
      requestedBy: userId,
      timeoutSeconds: 1800,
      maxRetries: 2,
    });

    const [claimA, claimB] = await Promise.all([
      repository.claimNext('claimant-a'),
      repository.claimNext('claimant-b'),
    ]);

    expect(claimA).not.toBeNull();
    expect(claimB).not.toBeNull();
    expect(claimA!.id).not.toBe(claimB!.id);

    const [refetchedA, refetchedB] = await Promise.all([
      prisma.vulnScanJob.findUniqueOrThrow({ where: { id: jobA.id } }),
      prisma.vulnScanJob.findUniqueOrThrow({ where: { id: jobB.id } }),
    ]);
    expect(refetchedA.status).toBe('RUNNING');
    expect(refetchedB.status).toBe('RUNNING');
  });

  it('requestPause + markPaused + resumeIfPaused round-trip a RUNNING job back to PENDING', async () => {
    const job = await repository.create({
      workspaceId,
      projectId,
      targetId,
      scanners: ['NUCLEI'],
      templateId: null,
      config: null,
      priority: 0,
      requestedBy: userId,
      timeoutSeconds: 1800,
      maxRetries: 2,
    });
    await repository.claimNext(`pause-claimant-${job.id}`);

    const pauseRequested = await repository.requestPause(job.id);
    expect(pauseRequested?.pauseRequestedAt).not.toBeNull();

    const paused = await repository.markPaused(job.id);
    expect(paused.status).toBe('PAUSED');
    expect(paused.claimedBy).toBeNull();

    const resumed = await repository.resumeIfPaused(job.id);
    expect(resumed?.status).toBe('PENDING');
    expect(resumed?.pausedAt).toBeNull();
  });

  it('findOrphaned returns RUNNING jobs whose heartbeat predates the cutoff', async () => {
    const job = await repository.create({
      workspaceId,
      projectId,
      targetId,
      scanners: ['NUCLEI'],
      templateId: null,
      config: null,
      priority: 0,
      requestedBy: userId,
      timeoutSeconds: 1800,
      maxRetries: 2,
    });
    await repository.claimNext(`heartbeat-claimant-${job.id}`);
    // Simulate a stale heartbeat by backdating it directly.
    await prisma.vulnScanJob.update({
      where: { id: job.id },
      data: { lastHeartbeatAt: new Date(Date.now() - 120_000) },
    });

    const orphaned = await repository.findOrphaned(
      new Date(Date.now() - 60_000),
    );
    expect(orphaned.map((j) => j.id)).toContain(job.id);
  });
});
