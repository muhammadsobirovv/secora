import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { createRealPrismaService } from '../../../../../test-utils/real-prisma-service.js';
import { createRealTransactionHost } from '../../../../../test-utils/real-prisma-transaction-host.js';
import { PrismaReconFindingsRepository } from './prisma-recon-findings.repository.js';
import { PrismaReconJobsRepository } from './prisma-recon-jobs.repository.js';
import type { PrismaService } from '../../../../../prisma/prisma.service.js';

describe('PrismaReconFindingsRepository (integration)', () => {
  let prisma: PrismaService;
  let repository: PrismaReconFindingsRepository;
  let jobsRepository: PrismaReconJobsRepository;
  let workspaceId: string;
  let projectId: string;
  let targetId: string;
  let jobId: string;
  let userId: string;
  const email = `itest-recon-findings-${Date.now()}@example.com`;

  beforeAll(async () => {
    prisma = createRealPrismaService();
    const txHost = createRealTransactionHost(prisma);
    repository = new PrismaReconFindingsRepository(txHost);
    jobsRepository = new PrismaReconJobsRepository(txHost);

    const user = await prisma.user.create({
      data: {
        email,
        displayName: 'Recon Findings Fixture',
        emailVerified: true,
      },
    });
    userId = user.id;
    const workspace = await prisma.workspace.create({
      data: {
        name: 'Recon Findings Fixture WS',
        slug: `recon-findings-fixture-ws-${Date.now()}`,
      },
    });
    workspaceId = workspace.id;
    const project = await prisma.project.create({
      data: {
        workspaceId,
        name: 'Recon Findings Fixture Project',
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
    const job = await jobsRepository.create({
      workspaceId,
      projectId,
      targetId,
      tools: ['SUBFINDER'],
      requestedBy: userId,
      timeoutSeconds: 600,
      maxRetries: 2,
    });
    jobId = job.id;
  });

  afterAll(async () => {
    await prisma.reconFinding.deleteMany({ where: { workspaceId } });
    await prisma.reconJob.deleteMany({ where: { workspaceId } });
    await prisma.target.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { createdBy: userId } });
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it('upsertMany inserts a new row on first write', async () => {
    const [finding] = await repository.upsertMany([
      {
        jobId,
        workspaceId,
        projectId,
        targetId,
        type: 'SUBDOMAIN',
        value: 'api.example.com',
        data: { source: 'crtsh' },
        source: 'SUBFINDER',
        dedupKey: 'api.example.com',
      },
    ]);

    expect(finding).toBeDefined();
    const found = await repository.findById(finding.id);
    expect(found?.value).toBe('api.example.com');
  });

  it('upsertMany on the same (targetId, type, dedupKey) updates the existing row instead of creating a duplicate', async () => {
    const firstSeenAt = (await repository.list({ workspaceId, jobId }))[0]
      .firstSeenAt;

    const [updated] = await repository.upsertMany([
      {
        jobId,
        workspaceId,
        projectId,
        targetId,
        type: 'SUBDOMAIN',
        value: 'api.example.com',
        data: { source: 'crtsh', extra: 'updated-run' },
        source: 'SUBFINDER',
        dedupKey: 'api.example.com', // same key as the previous test
      },
    ]);

    const all = await repository.list({
      workspaceId,
      jobId,
      targetId,
      type: 'SUBDOMAIN',
    });
    expect(all).toHaveLength(1);
    expect(updated.data).toMatchObject({ extra: 'updated-run' });
    // firstSeenAt is preserved across the upsert; lastSeenAt advances.
    expect(updated.firstSeenAt.getTime()).toBe(firstSeenAt.getTime());
    expect(updated.lastSeenAt.getTime()).toBeGreaterThanOrEqual(
      firstSeenAt.getTime(),
    );
  });

  it('a different dedupKey for the same type creates a distinct row', async () => {
    await repository.upsertMany([
      {
        jobId,
        workspaceId,
        projectId,
        targetId,
        type: 'SUBDOMAIN',
        value: 'www.example.com',
        data: {},
        source: 'SUBFINDER',
        dedupKey: 'www.example.com',
      },
    ]);

    const all = await repository.list({
      workspaceId,
      targetId,
      type: 'SUBDOMAIN',
    });
    expect(all).toHaveLength(2);
  });

  it('markPromoted sets promotedTargetId', async () => {
    // promotedTargetId is a real FK to targets — must point at an actual
    // row, matching how PromoteFindingToTargetCommand always creates the
    // Target first and only then calls markPromoted.
    const promotedTarget = await prisma.target.create({
      data: {
        projectId,
        type: 'SUBDOMAIN',
        value: 'api.example.com',
        createdBy: userId,
      },
    });
    const [finding] = await repository.list({
      workspaceId,
      targetId,
      type: 'SUBDOMAIN',
    });
    const promoted = await repository.markPromoted(
      finding.id,
      promotedTarget.id,
    );
    expect(promoted.promotedTargetId).toBe(promotedTarget.id);
  });
});
