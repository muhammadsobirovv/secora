import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { createRealPrismaService } from '../../../../../test-utils/real-prisma-service.js';
import { createRealTransactionHost } from '../../../../../test-utils/real-prisma-transaction-host.js';
import { PrismaVulnScanJobLogsRepository } from './prisma-vuln-scan-job-logs.repository.js';
import { PrismaVulnScanJobsRepository } from './prisma-vuln-scan-jobs.repository.js';
import type { PrismaService } from '../../../../../prisma/prisma.service.js';

describe('PrismaVulnScanJobLogsRepository (integration)', () => {
  let prisma: PrismaService;
  let repository: PrismaVulnScanJobLogsRepository;
  let jobsRepository: PrismaVulnScanJobsRepository;
  let workspaceId: string;
  let projectId: string;
  let targetId: string;
  let jobId: string;
  let userId: string;
  const email = `itest-vuln-logs-${Date.now()}@example.com`;

  beforeAll(async () => {
    prisma = createRealPrismaService();
    const txHost = createRealTransactionHost(prisma);
    repository = new PrismaVulnScanJobLogsRepository(txHost);
    jobsRepository = new PrismaVulnScanJobsRepository(txHost);

    const user = await prisma.user.create({
      data: { email, displayName: 'Vuln Logs Fixture', emailVerified: true },
    });
    userId = user.id;
    const workspace = await prisma.workspace.create({
      data: {
        name: 'Vuln Logs Fixture WS',
        slug: `vuln-logs-fixture-ws-${Date.now()}`,
      },
    });
    workspaceId = workspace.id;
    const project = await prisma.project.create({
      data: {
        workspaceId,
        name: 'Vuln Logs Fixture Project',
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
    await prisma.vulnScanJob.deleteMany({ where: { workspaceId } });
    await prisma.target.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { createdBy: userId } });
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it('append + listSince returns rows in seq order, respecting an exclusive cursor', async () => {
    await repository.append({
      jobId,
      toolRunId: null,
      level: 'INFO',
      message: 'first',
    });
    const second = await repository.append({
      jobId,
      toolRunId: null,
      level: 'WARN',
      message: 'second',
    });
    await repository.append({
      jobId,
      toolRunId: null,
      level: 'ERROR',
      message: 'third',
    });

    const all = await repository.listSince(jobId, null);
    expect(all.map((l) => l.message)).toEqual(['first', 'second', 'third']);

    const sinceSecond = await repository.listSince(jobId, second.seq);
    expect(sinceSecond.map((l) => l.message)).toEqual(['third']);
  });
});
