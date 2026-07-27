import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import { Prisma } from '../../../../../prisma-types.js';
import type {
  AgentOrchestrationRepository,
  AgentTaskRecord,
  AgentToolCallLogRecord,
  CreateAgentTaskInput,
  CreateAgentToolCallLogInput,
  CreateOrchestrationRunInput,
  ListOrchestrationRunsFilter,
  OrchestrationRunRecord,
  UpdateAgentTaskInput,
  UpdateOrchestrationRunInput,
} from '../../../domain/repositories/agent-orchestration.repository.interface.js';

type OrchestrationRunRow = Omit<OrchestrationRunRecord, 'planJson'> & {
  planJson: unknown;
};
type AgentTaskRow = Omit<AgentTaskRecord, 'input' | 'output' | 'sources'> & {
  input: unknown;
  output: unknown;
  sources: unknown;
};

function toRunRecord(row: OrchestrationRunRow): OrchestrationRunRecord {
  return { ...row, planJson: (row.planJson as Record<string, unknown> | null) ?? null };
}

function toTaskRecord(row: AgentTaskRow): AgentTaskRecord {
  return {
    ...row,
    input: (row.input as Record<string, unknown> | null) ?? null,
    output: (row.output as Record<string, unknown> | null) ?? null,
    sources: (row.sources as unknown[] | null) ?? null,
  };
}

/// See the doc comment on AgentOrchestrationRepository — this whole class
/// is raw SQL (never the typed Prisma Client) because OrchestrationRun/
/// AgentTask/AgentToolCallLog were added via a hand-applied migration, not
/// `prisma generate`.
@Injectable()
export class PrismaAgentOrchestrationRepository
  implements AgentOrchestrationRepository
{
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  async createRun(
    input: CreateOrchestrationRunInput,
  ): Promise<OrchestrationRunRecord> {
    const rows = await this.txHost.tx.$queryRaw<OrchestrationRunRow[]>`
      INSERT INTO "orchestration_runs"
        ("id", "workspaceId", "projectId", "userId", "goal", "status", "createdAt", "updatedAt")
      VALUES
        (${randomUUID()}, ${input.workspaceId}, ${input.projectId}, ${input.userId}, ${input.goal}, 'PENDING', now(), now())
      RETURNING *
    `;
    return toRunRecord(rows[0]);
  }

  async findRunById(id: string): Promise<OrchestrationRunRecord | null> {
    const rows = await this.txHost.tx.$queryRaw<OrchestrationRunRow[]>`
      SELECT * FROM "orchestration_runs" WHERE "id" = ${id}
    `;
    return rows[0] ? toRunRecord(rows[0]) : null;
  }

  async listRuns(
    filter: ListOrchestrationRunsFilter,
  ): Promise<OrchestrationRunRecord[]> {
    const rows = await this.txHost.tx.$queryRaw<OrchestrationRunRow[]>`
      SELECT * FROM "orchestration_runs"
      WHERE "workspaceId" = ${filter.workspaceId}
        ${filter.projectId ? Prisma.sql`AND "projectId" = ${filter.projectId}` : Prisma.empty}
        ${filter.status ? Prisma.sql`AND "status" = ${filter.status}::"OrchestrationRunStatus"` : Prisma.empty}
      ORDER BY "createdAt" DESC
      LIMIT ${filter.limit ?? 50}
    `;
    return rows.map(toRunRecord);
  }

  async updateRun(
    id: string,
    data: UpdateOrchestrationRunInput,
  ): Promise<OrchestrationRunRecord> {
    const sets: Prisma.Sql[] = [];
    if (data.status !== undefined) {
      sets.push(Prisma.sql`"status" = ${data.status}::"OrchestrationRunStatus"`);
    }
    if (data.planJson !== undefined) {
      sets.push(
        Prisma.sql`"planJson" = ${data.planJson ? JSON.stringify(data.planJson) : null}::jsonb`,
      );
    }
    if (data.resultSummary !== undefined) {
      sets.push(Prisma.sql`"resultSummary" = ${data.resultSummary}`);
    }
    if (data.confidenceScore !== undefined) {
      sets.push(Prisma.sql`"confidenceScore" = ${data.confidenceScore}`);
    }
    if (data.errorMessage !== undefined) {
      sets.push(Prisma.sql`"errorMessage" = ${data.errorMessage}`);
    }
    if (data.startedAt !== undefined) {
      sets.push(Prisma.sql`"startedAt" = ${data.startedAt}`);
    }
    if (data.finishedAt !== undefined) {
      sets.push(Prisma.sql`"finishedAt" = ${data.finishedAt}`);
    }
    sets.push(Prisma.sql`"updatedAt" = now()`);

    const rows = await this.txHost.tx.$queryRaw<OrchestrationRunRow[]>`
      UPDATE "orchestration_runs" SET ${Prisma.join(sets, ', ')} WHERE "id" = ${id} RETURNING *
    `;
    return toRunRecord(rows[0]);
  }

  async createTask(input: CreateAgentTaskInput): Promise<AgentTaskRecord> {
    const rows = await this.txHost.tx.$queryRaw<AgentTaskRow[]>`
      INSERT INTO "agent_tasks"
        ("id", "orchestrationRunId", "parentTaskId", "agentType", "title", "input", "status", "retryCount", "createdAt", "updatedAt")
      VALUES
        (${randomUUID()}, ${input.orchestrationRunId}, ${input.parentTaskId}, ${input.agentType}::"AgentType", ${input.title}, ${input.input ? JSON.stringify(input.input) : null}::jsonb, 'QUEUED', 0, now(), now())
      RETURNING *
    `;
    return toTaskRecord(rows[0]);
  }

  async findTaskById(id: string): Promise<AgentTaskRecord | null> {
    const rows = await this.txHost.tx.$queryRaw<AgentTaskRow[]>`
      SELECT * FROM "agent_tasks" WHERE "id" = ${id}
    `;
    return rows[0] ? toTaskRecord(rows[0]) : null;
  }

  async listTasksForRun(orchestrationRunId: string): Promise<AgentTaskRecord[]> {
    const rows = await this.txHost.tx.$queryRaw<AgentTaskRow[]>`
      SELECT * FROM "agent_tasks" WHERE "orchestrationRunId" = ${orchestrationRunId} ORDER BY "createdAt" ASC
    `;
    return rows.map(toTaskRecord);
  }

  async listSubTasks(parentTaskId: string): Promise<AgentTaskRecord[]> {
    const rows = await this.txHost.tx.$queryRaw<AgentTaskRow[]>`
      SELECT * FROM "agent_tasks" WHERE "parentTaskId" = ${parentTaskId} ORDER BY "createdAt" ASC
    `;
    return rows.map(toTaskRecord);
  }

  async updateTask(id: string, data: UpdateAgentTaskInput): Promise<AgentTaskRecord> {
    const sets: Prisma.Sql[] = [];
    if (data.status !== undefined) {
      sets.push(Prisma.sql`"status" = ${data.status}::"AgentTaskStatus"`);
    }
    if (data.output !== undefined) {
      sets.push(
        Prisma.sql`"output" = ${data.output ? JSON.stringify(data.output) : null}::jsonb`,
      );
    }
    if (data.reasoningSummary !== undefined) {
      sets.push(Prisma.sql`"reasoningSummary" = ${data.reasoningSummary}`);
    }
    if (data.confidenceScore !== undefined) {
      sets.push(Prisma.sql`"confidenceScore" = ${data.confidenceScore}`);
    }
    if (data.sources !== undefined) {
      sets.push(
        Prisma.sql`"sources" = ${data.sources ? JSON.stringify(data.sources) : null}::jsonb`,
      );
    }
    if (data.errorMessage !== undefined) {
      sets.push(Prisma.sql`"errorMessage" = ${data.errorMessage}`);
    }
    if (data.retryCount !== undefined) {
      sets.push(Prisma.sql`"retryCount" = ${data.retryCount}`);
    }
    if (data.startedAt !== undefined) {
      sets.push(Prisma.sql`"startedAt" = ${data.startedAt}`);
    }
    if (data.finishedAt !== undefined) {
      sets.push(Prisma.sql`"finishedAt" = ${data.finishedAt}`);
    }
    sets.push(Prisma.sql`"updatedAt" = now()`);

    const rows = await this.txHost.tx.$queryRaw<AgentTaskRow[]>`
      UPDATE "agent_tasks" SET ${Prisma.join(sets, ', ')} WHERE "id" = ${id} RETURNING *
    `;
    return toTaskRecord(rows[0]);
  }

  async createToolCallLog(
    input: CreateAgentToolCallLogInput,
  ): Promise<AgentToolCallLogRecord> {
    const rows = await this.txHost.tx.$queryRaw<
      (Omit<AgentToolCallLogRecord, 'input' | 'output'> & {
        input: unknown;
        output: unknown;
      })[]
    >`
      INSERT INTO "agent_tool_call_logs"
        ("id", "agentTaskId", "toolName", "input", "output", "errorMessage", "durationMs", "createdAt")
      VALUES
        (${randomUUID()}, ${input.agentTaskId}, ${input.toolName}, ${JSON.stringify(input.input)}::jsonb, ${input.output ? JSON.stringify(input.output) : null}::jsonb, ${input.errorMessage}, ${input.durationMs}, now())
      RETURNING *
    `;
    const row = rows[0];
    return {
      ...row,
      input: (row.input as Record<string, unknown>) ?? {},
      output: (row.output as Record<string, unknown> | null) ?? null,
    };
  }

  async listToolCallLogsForTask(
    agentTaskId: string,
  ): Promise<AgentToolCallLogRecord[]> {
    const rows = await this.txHost.tx.$queryRaw<
      (Omit<AgentToolCallLogRecord, 'input' | 'output'> & {
        input: unknown;
        output: unknown;
      })[]
    >`
      SELECT * FROM "agent_tool_call_logs" WHERE "agentTaskId" = ${agentTaskId} ORDER BY "createdAt" ASC
    `;
    return rows.map((row) => ({
      ...row,
      input: (row.input as Record<string, unknown>) ?? {},
      output: (row.output as Record<string, unknown> | null) ?? null,
    }));
  }

  /// Module 11 — Performance optimizations (task #235). One
  /// `WHERE ... IN (...)` round-trip instead of the N separate
  /// listToolCallLogsForTask calls AgentOrchestratorService.toolCallsByTaskId
  /// and AgentExplainabilityService.explainRun used to fan out via
  /// Promise.all.
  async listToolCallLogsForTasks(
    agentTaskIds: string[],
  ): Promise<Map<string, AgentToolCallLogRecord[]>> {
    const byTaskId = new Map<string, AgentToolCallLogRecord[]>();
    if (agentTaskIds.length === 0) return byTaskId;

    const rows = await this.txHost.tx.$queryRaw<
      (Omit<AgentToolCallLogRecord, 'input' | 'output'> & {
        input: unknown;
        output: unknown;
      })[]
    >`
      SELECT * FROM "agent_tool_call_logs"
      WHERE "agentTaskId" IN (${Prisma.join(agentTaskIds)})
      ORDER BY "createdAt" ASC
    `;
    for (const row of rows) {
      const record: AgentToolCallLogRecord = {
        ...row,
        input: (row.input as Record<string, unknown>) ?? {},
        output: (row.output as Record<string, unknown> | null) ?? null,
      };
      const list = byTaskId.get(record.agentTaskId) ?? [];
      list.push(record);
      byTaskId.set(record.agentTaskId, list);
    }
    return byTaskId;
  }
}
