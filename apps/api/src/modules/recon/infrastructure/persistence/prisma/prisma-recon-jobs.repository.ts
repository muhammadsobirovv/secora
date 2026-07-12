import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type {
  CreateReconJobInput,
  ListReconJobsFilter,
  ReconJobsRepository,
  ReconJobWithToolRuns,
  RetryScheduleInput,
} from '../../../domain/repositories/recon-jobs.repository.interface.js';
import type { ReconJob } from '../../../../../prisma-types.js';

const WITH_TOOL_RUNS = { toolRuns: true } as const;

@Injectable()
export class PrismaReconJobsRepository implements ReconJobsRepository {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  create(input: CreateReconJobInput): Promise<ReconJobWithToolRuns> {
    return this.txHost.tx.reconJob.create({
      data: {
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        targetId: input.targetId,
        tools: input.tools,
        requestedBy: input.requestedBy,
        timeoutSeconds: input.timeoutSeconds,
        maxRetries: input.maxRetries,
        toolRuns: {
          create: input.tools.map((tool) => ({ tool })),
        },
      },
      include: WITH_TOOL_RUNS,
    });
  }

  findById(id: string): Promise<ReconJobWithToolRuns | null> {
    return this.txHost.tx.reconJob.findUnique({
      where: { id },
      include: WITH_TOOL_RUNS,
    });
  }

  findByIdForWorkspace(
    id: string,
    workspaceId: string,
  ): Promise<ReconJobWithToolRuns | null> {
    return this.txHost.tx.reconJob.findFirst({
      where: { id, workspaceId },
      include: WITH_TOOL_RUNS,
    });
  }

  list(filter: ListReconJobsFilter): Promise<ReconJobWithToolRuns[]> {
    return this.txHost.tx.reconJob.findMany({
      where: {
        workspaceId: filter.workspaceId,
        ...(filter.projectId ? { projectId: filter.projectId } : {}),
        ...(filter.targetId ? { targetId: filter.targetId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
      },
      include: WITH_TOOL_RUNS,
      orderBy: { createdAt: 'desc' },
      take: filter.limit ?? 50,
    });
  }

  async claimNext(claimantId: string): Promise<ReconJob | null> {
    const rows = await this.txHost.tx.$queryRaw<ReconJob[]>`
      UPDATE "recon_jobs"
      SET status = 'RUNNING', "claimedAt" = now(), "claimedBy" = ${claimantId},
          "startedAt" = now(), "updatedAt" = now()
      WHERE id = (
        SELECT id FROM "recon_jobs"
        WHERE status IN ('PENDING', 'RETRYING')
          AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= now())
        ORDER BY "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING *;
    `;
    return rows[0] ?? null;
  }

  markStarted(id: string): Promise<ReconJob> {
    return this.txHost.tx.reconJob.update({
      where: { id },
      data: { startedAt: new Date() },
    });
  }

  markCompleted(id: string): Promise<ReconJob> {
    return this.txHost.tx.reconJob.update({
      where: { id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
  }

  markFailed(id: string, error: string): Promise<ReconJob> {
    return this.txHost.tx.reconJob.update({
      where: { id },
      data: { status: 'FAILED', completedAt: new Date(), error },
    });
  }

  markCancelled(id: string): Promise<ReconJob> {
    return this.txHost.tx.reconJob.update({
      where: { id },
      data: { status: 'CANCELLED', completedAt: new Date() },
    });
  }

  scheduleRetry(id: string, input: RetryScheduleInput): Promise<ReconJob> {
    return this.txHost.tx.reconJob.update({
      where: { id },
      data: {
        status: 'RETRYING',
        retryCount: input.retryCount,
        nextAttemptAt: input.nextAttemptAt,
        error: input.error,
        claimedAt: null,
        claimedBy: null,
      },
    });
  }

  async cancelIfPending(id: string): Promise<ReconJob | null> {
    const result = await this.txHost.tx.reconJob.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'CANCELLED', completedAt: new Date() },
    });
    if (result.count === 0) return null;
    return this.txHost.tx.reconJob.findUnique({ where: { id } });
  }

  async requestCancel(id: string): Promise<ReconJob | null> {
    const result = await this.txHost.tx.reconJob.updateMany({
      where: { id, status: { in: ['RUNNING', 'RETRYING'] } },
      data: { cancelRequestedAt: new Date() },
    });
    if (result.count === 0) return null;
    return this.txHost.tx.reconJob.findUnique({ where: { id } });
  }

  async resetForManualRetry(id: string): Promise<ReconJob | null> {
    const result = await this.txHost.tx.reconJob.updateMany({
      where: { id, status: 'FAILED' },
      data: {
        status: 'PENDING',
        error: null,
        nextAttemptAt: null,
        completedAt: null,
      },
    });
    if (result.count === 0) return null;
    return this.txHost.tx.reconJob.findUnique({ where: { id } });
  }

  findOrphaned(claimedBefore: Date): Promise<ReconJob[]> {
    return this.txHost.tx.reconJob.findMany({
      where: { status: 'RUNNING', claimedAt: { lt: claimedBefore } },
    });
  }
}
