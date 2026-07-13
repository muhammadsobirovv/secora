import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { createRealPrismaService } from '../../../../../test-utils/real-prisma-service.js';
import { createRealTransactionHost } from '../../../../../test-utils/real-prisma-transaction-host.js';
import { PrismaVulnFindingsRepository } from './prisma-vuln-findings.repository.js';
import { PrismaVulnScanJobsRepository } from './prisma-vuln-scan-jobs.repository.js';
import type { PrismaService } from '../../../../../prisma/prisma.service.js';

describe('PrismaVulnFindingsRepository (integration)', () => {
  let prisma: PrismaService;
  let repository: PrismaVulnFindingsRepository;
  let jobsRepository: PrismaVulnScanJobsRepository;
  let workspaceId: string;
  let projectId: string;
  let targetId: string;
  let jobId: string;
  let userId: string;
  const email = `itest-vuln-findings-${Date.now()}@example.com`;

  beforeAll(async () => {
    prisma = createRealPrismaService();
    const txHost = createRealTransactionHost(prisma);
    repository = new PrismaVulnFindingsRepository(txHost);
    jobsRepository = new PrismaVulnScanJobsRepository(txHost);

    const user = await prisma.user.create({
      data: {
        email,
        displayName: 'Vuln Findings Fixture',
        emailVerified: true,
      },
    });
    userId = user.id;
    const workspace = await prisma.workspace.create({
      data: {
        name: 'Vuln Findings Fixture WS',
        slug: `vuln-findings-fixture-ws-${Date.now()}`,
      },
    });
    workspaceId = workspace.id;
    const project = await prisma.project.create({
      data: {
        workspaceId,
        name: 'Vuln Findings Fixture Project',
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
    const job = await jobsRepository.create({
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
    jobId = job.id;
  });

  afterAll(async () => {
    await prisma.vulnFinding.deleteMany({ where: { workspaceId } });
    await prisma.vulnScanJob.deleteMany({ where: { workspaceId } });
    await prisma.target.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { createdBy: userId } });
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  function baseInput(
    overrides: Partial<
      Parameters<PrismaVulnFindingsRepository['upsertMany']>[0][number]
    > = {},
  ) {
    return {
      jobId,
      workspaceId,
      projectId,
      targetId,
      title: 'Exposed admin panel',
      description: 'An admin panel is exposed.',
      severity: 'MEDIUM' as const,
      cvssScore: null,
      cvssVector: null,
      cwe: null,
      owaspCategory: null,
      scanner: 'NUCLEI' as const,
      scannerVersion: null,
      confidence: 'CONFIRMED' as const,
      vulnType: 'exposure',
      path: '/admin',
      signature: 'exposed-panel-admin',
      matchedAt: 'https://example.com/admin',
      data: {},
      dedupKey: '/admin::exposure::exposed-panel-admin',
      tags: [],
      references: [],
      createdBy: userId,
      ...overrides,
    };
  }

  it('upsertMany inserts a new row and reports wasCreated=true', async () => {
    const [{ finding, wasCreated }] = await repository.upsertMany([
      baseInput(),
    ]);
    expect(wasCreated).toBe(true);
    expect(finding.title).toBe('Exposed admin panel');
    expect(finding.status).toBe('NEW');
  });

  it('upsertMany on the same (targetId, scanner, dedupKey) updates the row and reports wasCreated=false', async () => {
    const [{ finding, wasCreated }] = await repository.upsertMany([
      baseInput({ description: 'Updated description from a re-scan.' }),
    ]);
    expect(wasCreated).toBe(false);
    expect(finding.description).toBe('Updated description from a re-scan.');

    const all = await repository.list({ workspaceId, targetId });
    expect(all).toHaveLength(1);
  });

  it('preserves an analyst-set status across a re-scan upsert', async () => {
    const [finding] = await repository.list({ workspaceId, targetId });
    await repository.updateStatus(finding.id, 'CONFIRMED');

    await repository.upsertMany([
      baseInput({ description: 'Yet another re-scan.' }),
    ]);

    const refetched = await repository.findById(finding.id);
    expect(refetched?.status).toBe('CONFIRMED');
  });

  it('a different dedupKey for the same target+scanner creates a distinct row', async () => {
    await repository.upsertMany([
      baseInput({
        path: '/backup.zip',
        vulnType: 'exposed-content',
        signature: 'ffuf:200',
        dedupKey: '/backup.zip::exposed-content::ffuf:200',
        scanner: 'FFUF',
      }),
    ]);
    const all = await repository.list({ workspaceId, targetId });
    expect(all).toHaveLength(2);
  });

  it('bulkUpdateStatus updates only findings within the given workspace', async () => {
    const all = await repository.list({ workspaceId, targetId });
    const updated = await repository.bulkUpdateStatus(
      all.map((f) => f.id),
      workspaceId,
      'FALSE_POSITIVE',
    );
    expect(updated.every((f) => f.status === 'FALSE_POSITIVE')).toBe(true);
  });

  it('countBySeverity and countByStatus return zero-filled maps covering every enum value', async () => {
    const severityCounts = await repository.countBySeverity(workspaceId);
    expect(Object.keys(severityCounts).sort()).toEqual(
      ['CRITICAL', 'HIGH', 'INFO', 'LOW', 'MEDIUM'].sort(),
    );
    expect(severityCounts.MEDIUM).toBeGreaterThanOrEqual(1);

    const statusCounts = await repository.countByStatus(workspaceId);
    expect(statusCounts.FALSE_POSITIVE).toBeGreaterThanOrEqual(2);
  });
});
