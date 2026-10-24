import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type {
  CreateVulnScanJobInput,
  ListVulnScanJobsFilter,
  RetryScheduleInput,
  ScannerHistoryRow,
  VulnScanJobsRepository,
  VulnScanJobWithToolRuns,
} from '../../../domain/repositories/vuln-scan-jobs.repository.interface.js';
import type { Prisma, VulnScanJob } from '../../../../../prisma-types.js';

const WITH_TOOL_RUNS = { toolRuns: true } as const;

@Injectable()
export class PrismaVulnScanJobsRepository implements VulnScanJobsRepository {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  create(input: CreateVulnScanJobInput): Promise<VulnScanJobWithToolRuns> {
    return this.txHost.tx.vulnScanJob.create({
      data: {
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        targetId: input.targetId,
        scanners: input.scanners,
        templateId: input.templateId,
        // Coalesce null -> undefined (not Prisma.JsonNull): matches
        // prisma-activity.repository.ts / prisma-audit.repository.ts
        // precedent — "no config given" should omit the field, not store
        // a JSON null.
        config: (input.config ?? undefined) as
          Prisma.InputJsonValue | undefined,
        priority: input.priority,
        requestedBy: input.requestedBy,
        timeoutSeconds: input.timeoutSeconds,
        maxRetries: input.maxRetries,
        requestId: input.requestId,
        toolRuns: {
          create: input.scanners.map((scanner) => ({ scanner })),
        },
      },
      include: WITH_TOOL_RUNS,
    });
  }

  findById(id: string): Promise<VulnScanJobWithToolRuns | null> {
    return this.txHost.tx.vulnScanJob.findUnique({
      where: { id },
      include: WITH_TOOL_RUNS,
    });
  }

  findByIdForWorkspace(
    id: string,
    workspaceId: string,
  ): Promise<VulnScanJobWithToolRuns | null> {
    return this.txHost.tx.vulnScanJob.findFirst({
      where: { id, workspaceId },
      include: WITH_TOOL_RUNS,
    });
  }

  list(filter: ListVulnScanJobsFilter): Promise<VulnScanJobWithToolRuns[]> {
    return this.txHost.tx.vulnScanJob.findMany({
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

  async claimNext(claimantId: string): Promise<VulnScanJob | null> {
    const rows = await this.txHost.tx.$queryRaw<VulnScanJob[]>`
      UPDATE "vuln_scan_jobs"
      SET status = 'RUNNING', "claimedAt" = now(), "claimedBy" = ${claimantId},
          "startedAt" = COALESCE("startedAt", now()), "lastHeartbeatAt" = now(),
          "updatedAt" = now()
      WHERE id = (
        SELECT id FROM "vuln_scan_jobs"
        WHERE status IN ('PENDING', 'RETRYING')
          AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= now())
        ORDER BY priority DESC, "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING *;
    `;
    return rows[0] ?? null;
  }

  markStarted(id: string): Promise<VulnScanJob> {
    return this.txHost.tx.vulnScanJob.update({
      where: { id },
      data: { startedAt: new Date() },
    });
  }

  markCompleted(id: string, error?: string | null): Promise<VulnScanJob> {
    return this.txHost.tx.vulnScanJob.update({
      where: { id },
      data: { status: 'COMPLETED', completedAt: new Date(), error: error ?? null },
    });
  }

  markFailed(id: string, error: string): Promise<VulnScanJob> {
    return this.txHost.tx.vulnScanJob.update({
      where: { id },
      data: { status: 'FAILED', completedAt: new Date(), error },
    });
  }

  markCancelled(id: string): Promise<VulnScanJob> {
    return this.txHost.tx.vulnScanJob.update({
      where: { id },
      data: { status: 'CANCELLED', completedAt: new Date() },
    });
  }

  markPaused(id: string): Promise<VulnScanJob> {
    return this.txHost.tx.vulnScanJob.update({
      where: { id },
      data: {
        status: 'PAUSED',
        pausedAt: new Date(),
        pauseRequestedAt: null,
        claimedAt: null,
        claimedBy: null,
      },
    });
  }

  scheduleRetry(id: string, input: RetryScheduleInput): Promise<VulnScanJob> {
    return this.txHost.tx.vulnScanJob.update({
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

  async recordHeartbeat(id: string): Promise<void> {
    await this.txHost.tx.vulnScanJob.updateMany({
      where: { id, status: 'RUNNING' },
      data: { lastHeartbeatAt: new Date() },
    });
  }

  async cancelIfPending(id: string): Promise<VulnScanJob | null> {
    const result = await this.txHost.tx.vulnScanJob.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'CANCELLED', completedAt: new Date() },
    });
    if (result.count === 0) return null;
    return this.txHost.tx.vulnScanJob.findUnique({ where: { id } });
  }

  async requestCancel(id: string): Promise<VulnScanJob | null> {
    const result = await this.txHost.tx.vulnScanJob.updateMany({
      where: { id, status: { in: ['RUNNING', 'RETRYING', 'PAUSED'] } },
      data: { cancelRequestedAt: new Date() },
    });
    if (result.count === 0) return null;
    // A PAUSED job has no running worker to observe cancelRequestedAt, so
    // cancel it outright rather than leaving it stuck waiting for a
    // worker that will never look at it again.
    await this.txHost.tx.vulnScanJob.updateMany({
      where: { id, status: 'PAUSED' },
      data: { status: 'CANCELLED', completedAt: new Date() },
    });
    return this.txHost.tx.vulnScanJob.findUnique({ where: { id } });
  }

  async requestPause(id: string): Promise<VulnScanJob | null> {
    const result = await this.txHost.tx.vulnScanJob.updateMany({
      where: { id, status: { in: ['RUNNING', 'RETRYING'] } },
      data: { pauseRequestedAt: new Date() },
    });
    if (result.count === 0) return null;
    return this.txHost.tx.vulnScanJob.findUnique({ where: { id } });
  }

  async resumeIfPaused(id: string): Promise<VulnScanJob | null> {
    const result = await this.txHost.tx.vulnScanJob.updateMany({
      where: { id, status: 'PAUSED' },
      data: {
        status: 'PENDING',
        pausedAt: null,
        pauseRequestedAt: null,
        nextAttemptAt: null,
      },
    });
    if (result.count === 0) return null;
    return this.txHost.tx.vulnScanJob.findUnique({ where: { id } });
  }

  async resetForManualRetry(id: string): Promise<VulnScanJob | null> {
    const result = await this.txHost.tx.vulnScanJob.updateMany({
      where: { id, status: 'FAILED' },
      data: {
        status: 'PENDING',
        error: null,
        nextAttemptAt: null,
        completedAt: null,
      },
    });
    if (result.count === 0) return null;
    return this.txHost.tx.vulnScanJob.findUnique({ where: { id } });
  }

  findOrphaned(heartbeatBefore: Date): Promise<VulnScanJob[]> {
    return this.txHost.tx.vulnScanJob.findMany({
      where: {
        status: 'RUNNING',
        OR: [
          { lastHeartbeatAt: { lt: heartbeatBefore } },
          { lastHeartbeatAt: null, claimedAt: { lt: heartbeatBefore } },
        ],
      },
    });
  }

  async getScannerHistory(workspaceId: string): Promise<ScannerHistoryRow[]> {
    const toolRuns = await this.txHost.tx.vulnScanJobToolRun.findMany({
      where: { job: { workspaceId } },
      select: {
        scanner: true,
        status: true,
        findingsCount: true,
        startedAt: true,
      },
    });

    const byScanner = new Map<string, ScannerHistoryRow>();
    for (const run of toolRuns) {
      const row = byScanner.get(run.scanner) ?? {
        scanner: run.scanner,
        totalRuns: 0,
        completedRuns: 0,
        failedRuns: 0,
        totalFindings: 0,
        lastRunAt: null,
      };
      row.totalRuns += 1;
      if (run.status === 'COMPLETED') row.completedRuns += 1;
      if (run.status === 'FAILED') row.failedRuns += 1;
      row.totalFindings += run.findingsCount;
      if (run.startedAt && (!row.lastRunAt || run.startedAt > row.lastRunAt)) {
        row.lastRunAt = run.startedAt;
      }
      byScanner.set(run.scanner, row);
    }
    return [...byScanner.values()];
  }

  countRunning(workspaceId: string): Promise<number> {
    return this.txHost.tx.vulnScanJob.count({
      where: { workspaceId, status: 'RUNNING' },
    });
  }

  countActiveForTarget(targetId: string): Promise<number> {
    return this.txHost.tx.vulnScanJob.count({
      where: {
        targetId,
        status: { in: ['PENDING', 'RUNNING', 'RETRYING', 'PAUSED'] },
      },
    });
  }

  countCreatedSince(filter: {
    since: Date;
    targetId?: string;
    workspaceId?: string;
  }): Promise<number> {
    return this.txHost.tx.vulnScanJob.count({
      where: {
        createdAt: { gte: filter.since },
        ...(filter.targetId ? { targetId: filter.targetId } : {}),
        ...(filter.workspaceId ? { workspaceId: filter.workspaceId } : {}),
      },
    });
  }
}
