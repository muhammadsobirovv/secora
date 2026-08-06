import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { EvaluationMetricType, EvaluationSubjectType } from '@pentesthub/shared';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Prisma } from '../../prisma-types.js';

/// Module 13 — AI Evaluation (task #289). `evaluation_runs` (and the raw
/// aggregation queries this repository also exposes over other Module 13
/// tables — `mcp_tool_invocations`, `prompt_test_runs`, `agent_sdk_runs`)
/// are all raw-SQL-only tables, same constraint/pattern as every other
/// Module 13 repository in this codebase. `WORKFLOW_SUCCESS`'s
/// aggregation is the one exception — `WorkflowRun` predates Module 13
/// and has full generated Prisma Client support, so `AiEvaluationService`
/// queries it directly via `this.prisma.workflowRun` instead of going
/// through this repository.

export interface EvaluationRunRow {
  id: string;
  workspaceId: string;
  metricType: EvaluationMetricType;
  subjectType: EvaluationSubjectType;
  subjectId: string | null;
  provider: string | null;
  model: string | null;
  score: number | null;
  resultJson: Record<string, unknown> | null;
  createdBy: string | null;
  createdAt: Date;
}

export interface ToolInvocationStats {
  totalCalls: number;
  successCount: number;
  errorCount: number;
  avgDurationMs: number | null;
}

export interface PromptEffectivenessStats {
  sampleCount: number;
  avgRating: number | null;
  avgDurationMs: number | null;
}

export interface AgentRunDurationStats {
  sampleCount: number;
  avgDurationMs: number | null;
}

@Injectable()
export class EvaluationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createRun(params: {
    workspaceId: string;
    metricType: EvaluationMetricType;
    subjectType: EvaluationSubjectType;
    subjectId: string | null;
    provider: string | null;
    model: string | null;
    score: number | null;
    result: Record<string, unknown> | null;
    createdBy: string | null;
  }): Promise<EvaluationRunRow> {
    const rows = await this.prisma.$queryRaw<EvaluationRunRow[]>`
      INSERT INTO "evaluation_runs"
        ("id", "workspaceId", "metricType", "subjectType", "subjectId", "provider", "model", "score", "resultJson", "createdBy")
      VALUES
        (${randomUUID()}, ${params.workspaceId}, ${params.metricType}::"EvaluationMetricType", ${params.subjectType}::"EvaluationSubjectType", ${params.subjectId}, ${params.provider}, ${params.model}, ${params.score}, ${params.result ? JSON.stringify(params.result) : null}::jsonb, ${params.createdBy})
      RETURNING *
    `;
    return rows[0]!;
  }

  async listRuns(params: {
    workspaceId: string;
    metricType?: EvaluationMetricType;
    subjectType?: EvaluationSubjectType;
    subjectId?: string;
    limit: number;
  }): Promise<EvaluationRunRow[]> {
    const metricFilter = params.metricType ? Prisma.sql`AND "metricType" = ${params.metricType}::"EvaluationMetricType"` : Prisma.empty;
    const subjectTypeFilter = params.subjectType ? Prisma.sql`AND "subjectType" = ${params.subjectType}::"EvaluationSubjectType"` : Prisma.empty;
    const subjectIdFilter = params.subjectId ? Prisma.sql`AND "subjectId" = ${params.subjectId}` : Prisma.empty;
    return this.prisma.$queryRaw<EvaluationRunRow[]>(
      Prisma.sql`
        SELECT * FROM "evaluation_runs"
        WHERE "workspaceId" = ${params.workspaceId} ${metricFilter} ${subjectTypeFilter} ${subjectIdFilter}
        ORDER BY "createdAt" DESC
        LIMIT ${params.limit}
      `,
    );
  }

  /// One summary row per `EvaluationMetricType` that has at least one
  /// sample in this workspace — `sampleCount`/`averageScore` over every
  /// run of that metric, `latestScore` from the single most recent one.
  async summarize(workspaceId: string): Promise<{ metricType: EvaluationMetricType; sampleCount: number; averageScore: number | null; latestScore: number | null }[]> {
    return this.prisma.$queryRaw<
      { metricType: EvaluationMetricType; sampleCount: bigint; averageScore: number | null; latestScore: number | null }[]
    >`
      SELECT
        "metricType",
        COUNT(*) AS "sampleCount",
        AVG("score") AS "averageScore",
        (ARRAY_AGG("score" ORDER BY "createdAt" DESC))[1] AS "latestScore"
      FROM "evaluation_runs"
      WHERE "workspaceId" = ${workspaceId}
      GROUP BY "metricType"
    `.then((rows) => rows.map((r) => ({ ...r, sampleCount: Number(r.sampleCount) })));
  }

  async toolInvocationStats(workspaceId: string, toolName: string, sinceDays: number): Promise<ToolInvocationStats> {
    const rows = await this.prisma.$queryRaw<
      { totalCalls: bigint; successCount: bigint; avgDurationMs: number | null }[]
    >`
      SELECT
        COUNT(*) AS "totalCalls",
        COUNT(*) FILTER (WHERE "errorMessage" IS NULL) AS "successCount",
        AVG("durationMs") AS "avgDurationMs"
      FROM "mcp_tool_invocations"
      WHERE "workspaceId" = ${workspaceId} AND "toolName" = ${toolName} AND "createdAt" >= now() - make_interval(days => ${sinceDays})
    `;
    const row = rows[0];
    const totalCalls = row ? Number(row.totalCalls) : 0;
    const successCount = row ? Number(row.successCount) : 0;
    return {
      totalCalls,
      successCount,
      errorCount: totalCalls - successCount,
      avgDurationMs: row?.avgDurationMs ?? null,
    };
  }

  async promptEffectivenessStats(promptTemplateId: string): Promise<PromptEffectivenessStats> {
    const rows = await this.prisma.$queryRaw<
      { sampleCount: bigint; avgRating: number | null; avgDurationMs: number | null }[]
    >`
      SELECT
        COUNT(*) FILTER (WHERE "ratingScore" IS NOT NULL) AS "sampleCount",
        AVG("ratingScore") AS "avgRating",
        AVG("durationMs") AS "avgDurationMs"
      FROM "prompt_test_runs"
      WHERE "promptTemplateId" = ${promptTemplateId}
    `;
    const row = rows[0];
    return {
      sampleCount: row ? Number(row.sampleCount) : 0,
      avgRating: row?.avgRating ?? null,
      avgDurationMs: row?.avgDurationMs ?? null,
    };
  }

  async agentRunDurationStats(agentSdkDefinitionId: string): Promise<AgentRunDurationStats> {
    const rows = await this.prisma.$queryRaw<{ sampleCount: bigint; avgDurationMs: number | null }[]>`
      SELECT
        COUNT(*) AS "sampleCount",
        AVG(EXTRACT(EPOCH FROM ("finishedAt" - "startedAt")) * 1000) AS "avgDurationMs"
      FROM "agent_sdk_runs"
      WHERE "agentSdkDefinitionId" = ${agentSdkDefinitionId} AND "finishedAt" IS NOT NULL AND "startedAt" IS NOT NULL
    `;
    const row = rows[0];
    return {
      sampleCount: row ? Number(row.sampleCount) : 0,
      avgDurationMs: row?.avgDurationMs ?? null,
    };
  }
}
