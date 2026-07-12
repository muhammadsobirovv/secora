import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { createRealPrismaService } from '../../../../../test-utils/real-prisma-service.js';
import { createRealTransactionHost } from '../../../../../test-utils/real-prisma-transaction-host.js';
import { PrismaReconJobLogsRepository } from './prisma-recon-job-logs.repository.js';
import { PrismaReconJobsRepository } from './prisma-recon-jobs.repository.js';
import type { PrismaService } from '../../../../../prisma/prisma.service.js';

describe('PrismaReconJobLogsRepository (integration)', () => {
  let prisma: PrismaService;
  let repository: PrismaReconJobLogsRepository;
  let workspaceId: string;
  let projectId: string;
  let jobId: string;
  let userId: string;
  const email = `itest-recon-logs-${Date.now()}@example.com`;

  beforeAll(async () => {
    prisma = createRealPrismaService();
    const txHost = createRealTransactionHost(prisma);
    repository = new PrismaReconJobLogsRepository(txHost);
    const jobsRepository = new PrismaReconJobsRepository(txHost);

    const user = await prisma.user.create({
      data: { email, displayName: 'Recon Logs Fixture', emailVerified: true },
    });
    userId = user.id;
    const workspace = await prisma.workspace.create({
      data: {
        name: 'Recon Logs Fixture WS',
        slug: `recon-logs-fixture-ws-${Date.now()}`,
      },
    });
    workspaceId = workspace.id;
    const project = await prisma.project.create({
      data: {
        workspaceId,
        name: 'Recon Logs Fixture Project',
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
    const job = await jobsRepository.create({
      workspaceId,
      projectId,
      targetId: target.id,
      tools: ['SUBFINDER'],
      requestedBy: userId,
      timeoutSeconds: 600,
      maxRetries: 2,
    });
    jobId = job.id;
  });

  afterAll(async () => {
    await prisma.reconJobLog.deleteMany({ where: { jobId } });
    await prisma.reconJob.deleteMany({ where: { workspaceId } });
    await prisma.target.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { createdBy: userId } });
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it('listSince(null) returns every log in seq order', async () => {
    for (const message of ['first', 'second', 'third']) {
      await repository.append({
        jobId,
        toolRunId: null,
        level: 'INFO',
        message,
      });
    }

    const logs = await repository.listSince(jobId, null);
    expect(logs.map((l) => l.message)).toEqual(['first', 'second', 'third']);
    // seq is strictly increasing — this is the SSE stream's cursor.
    for (let i = 1; i < logs.length; i++) {
      expect(logs[i].seq > logs[i - 1].seq).toBe(true);
    }
  });

  it('listSince(cursor) returns only logs after that seq — the SSE poll-loop contract', async () => {
    const all = await repository.listSince(jobId, null);
    const cursor = all[0].seq;

    await repository.append({
      jobId,
      toolRunId: null,
      level: 'WARN',
      message: 'fourth',
    });

    const since = await repository.listSince(