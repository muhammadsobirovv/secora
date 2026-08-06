import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

/// Module 13 — AI Automation Platform Observability (task #290). Raw SQL
/// aggregations over the Module 13 tables (`mcp_tool_invocations`,
/// `agent_sdk_runs`, `script_executions`, `relay_commands`,
/// `evaluation_runs`) plus one query against the pre-Module-13
/// `WorkflowRun`/`Workflow` models via the generated Prisma Client
/// directly (same `WORKFLOW_SUCCESS` precedent `EvaluationRepository`
/// already established). Deliberately does NOT inject
/// `McpSessionRepository`/`EvaluationRepository`/etc. and call through
/// them — every other Module 13 feature module already imports
/// `ObservabilityModule` (for `MetricsRegistryService`, see each
/// module's doc comment), so `ObservabilityModule` importing any of
/// *them* back would be a real circular module dependency. Querying the
/// same tables directly (a few duplicated lines of raw SQL) keeps
/// `ObservabilityModule` a dependency-free leaf, exactly like
/// `EvaluationRepository` already does for `mcp_tool_invocations` and
/// `agent_sdk_runs`.
@Injectable()
export class AiPlatformObservabilityRepository {
  constructor(private readonly prisma: PrismaService) {}

  async mcpToolUsage(
    workspaceId: string,
    sinceDays: number,
  ): Promise<{ toolName: string; callCount: number; errorCount: number; avgDurationMs: number | null }[]> {
    return this.prisma.$queryRaw<
      { toolName: string; callCount: bigint; errorCount: bigint; avgDurationMs: number | null }[]
    >`
      SELECT
        "toolName",
        COUNT(*) AS "callCount",
        COUNT(*) FILTER (WHERE "errorMessage" IS NOT NULL) AS "errorCount",
        AVG("durationMs") AS "avgDurationMs"
      FROM "mcp_tool_invocations"
      WHERE "workspaceId" = ${workspaceId} AND "createdAt" >= now() - make_interval(days => ${sinceDays})
      GROUP BY "toolName"
      ORDER BY "callCount" DESC
    `.then((rows) => rows.map((r) => ({ ...r, callCount: Number(r.callCount), errorCount: Number(r.errorCount) })));
  }

  async agentSdkRunsSummary(
    workspaceId: string,
    sinceDays: number,
  ): Promise<{ totalRuns: number; succeeded: number; failed: number; running: number; avgDurationMs: number | null }> {
    const rows = await this.prisma.$queryRaw<
      { totalRuns: bigint; succeeded: bigint; failed: bigint; running: bigint; avgDurationMs: number | null }[]
    >`
      SELECT
        COUNT(*) AS "totalRuns",
        COUNT(*) FILTER (WHERE "status" = 'SUCCEEDED') AS "succeeded",
        COUNT(*) FILTER (WHERE "status" = 'FAILED') AS "failed",
        COUNT(*) FILTER (WHERE "status" IN ('PENDING', 'RUNNING')) AS "running",
        AVG(EXTRACT(EPOCH FROM ("finishedAt" - "startedAt")) * 1000) FILTER (WHERE "finishedAt" IS NOT NULL AND "startedAt" IS NOT NULL) AS "avgDurationMs"
      FROM "agent_sdk_runs"
      WHERE "workspaceId" = ${workspaceId} AND "createdAt" >= now() - make_interval(days => ${sinceDays})
    `;
    const row = rows[0];
    return {
      totalRuns: row ? Number(row.totalRuns) : 0,
      succeeded: row ? Number(row.succeeded) : 0,
      failed: row ? Number(row.failed) : 0,
      running: row ? Number(row.running) : 0,
      avgDurationMs: row?.avgDurationMs ?? null,
    };
  }

  async scriptExecutionsSummary(
    workspaceId: string,
    sinceDays: number,
  ): Promise<{ totalExecutions: number; succeeded: number; failed: number; timedOut: number; avgDurationMs: number | null }> {
    const rows = await this.prisma.$queryRaw<
      { totalExecutions: bigint; succeeded: bigint; failed: bigint; timedOut: bigint; avgDurationMs: number | null }[]
    >`
      SELECT
        COUNT(*) AS "totalExecutions",
        COUNT(*) FILTER (WHERE "status" = 'SUCCEEDED') AS "succeeded",
        COUNT(*) FILTER (WHERE "status" = 'FAILED') AS "failed",
        COUNT(*) FILTER (WHERE "status" = 'TIMEOUT') AS "timedOut",
        AVG("durationMs") AS "avgDurationMs"
      FROM "script_executions"
      WHERE "workspaceId" = ${workspaceId} AND "createdAt" >= now() - make_interval(days => ${sinceDays})
    `;
    const row = rows[0];
    return {
      totalExecutions: row ? Number(row.totalExecutions) : 0,
      succeeded: row ? Number(row.succeeded) : 0,
      failed: row ? Number(row.failed) : 0,
      timedOut: row ? Number(row.timedOut) : 0,
      avgDurationMs: row?.avgDurationMs ?? null,
    };
  }

  /// `WorkflowRun` has no `workspaceId` column of its own — joins through
  /// `Workflow.workspaceId`, same join `automation-engine`'s own queries
  /// use. Goes through the generated Prisma Client directly (not raw
  /// SQL) since `WorkflowRun` predates Module 13 and already has full
  /// client support — same `WORKFLOW_SUCCESS` precedent
  /// `AiEvaluationService` established.
  async workflowRunsSummary(
    workspaceId: string,
    sinceDays: number,
  ): Promise<{ totalRuns: number; succeeded: number; failed: number; running: number; avgDurationMs: number | null }> {
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
    const runs = await this.prisma.workflowRun.findMany({
      where: { workflow: { workspaceId }, createdAt: { gte: since } },
      select: { status: true, startedAt: true, finishedAt: true },
    });
    let succeeded = 0;
    let failed = 0;
    let running = 0;
    let durationSum = 0;
    let durationCount = 0;
    for (const run of runs) {
      if (run.status === 'SUCCEEDED') succeeded += 1;
      else if (run.status === 'FAILED') failed += 1;
      else if (run.status === 'PENDING' || run.status === 'RUNNING') running += 1;
      if (run.startedAt && run.finishedAt) {
        durationSum += run.finishedAt.getTime() - run.startedAt.getTime();
        durationCount += 1;
      }
    }
    return {
      totalRuns: runs.length,
      succeeded,
      failed,
      running,
      avgDurationMs: durationCount > 0 ? durationSum / durationCount : null,
    };
  }

  /// Current queue depth snapshot (no `sinceDays` window) — a relay
  /// command sitting in `PENDING` from a week ago is exactly the
  /// operationally interesting case a time-windowed query would hide.
  async relayCommandQueueSummary(
    workspaceId: string,
  ): Promise<{ target: 'DESKTOP' | 'BROWSER'; pending: number; delivered: number; completed: number; failed: number }[]> {
    const rows = await this.prisma.$queryRaw<
      { target: 'DESKTOP' | 'BROWSER'; pending: bigint; delivered: bigint; completed: bigint; failed: bigint }[]
    >`
      SELECT
        "target",
        COUNT(*) FILTER (WHERE "status" = 'PENDING') AS "pending",
        COUNT(*) FILTER (WHERE "status" = 'DELIVERED') AS "delivered",
        COUNT(*) FILTER (WHERE "status" = 'COMPLETED') AS "completed",
        COUNT(*) FILTER (WHERE "status" = 'FAILED') AS "failed"
      FROM "relay_commands"
      WHERE "workspaceId" = ${workspaceId}
      GROUP BY "target"
    `;
    return rows.map((r) => ({
      target: r.target,
      pending: Number(r.pending),
      delivered: Number(r.delivered),
      completed: Number(r.completed),
      failed: Number(r.failed),
    }));
  }

  async evaluationRunsSummary(
    workspaceId: string,
    sinceDays: number,
  ): Promise<{ metricType: string; sampleCount: number; averageScore: number | null }[]> {
    const rows = await this.prisma.$queryRaw<{ metricType: string; sampleCount: bigint; averageScore: number | null }[]>`
      SELECT "metricType", COUNT(*) AS "sampleCount", AVG("score") AS "averageScore"
      FROM "evaluation_runs"
      WHERE "workspaceId" = ${workspaceId} AND "createdAt" >= now() - make_interval(days => ${sinceDays})
      GROUP BY "metricType"
    `;
    return rows.map((r) => ({ ...r, sampleCount: Number(r.sampleCount) }));
  }
}
