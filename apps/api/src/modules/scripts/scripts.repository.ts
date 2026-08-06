import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { ScriptExecutionStatus, ScriptLanguage, ScriptPermission } from '@pentesthub/shared';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Prisma } from '../../prisma-types.js';

/// Module 13 — Script Engine (task #286). `script_definitions`/
/// `script_executions` are new Module 13 tables with no generated Prisma
/// Client support — raw SQL only, the same `Prisma.sql`/`Prisma.empty`
/// pattern `AgentSdkRepository`/`McpSessionRepository` already use.

export interface ScriptDefinitionRow {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  language: ScriptLanguage;
  sourceCode: string;
  permissions: ScriptPermission[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScriptExecutionRow {
  id: string;
  scriptDefinitionId: string;
  workspaceId: string;
  status: ScriptExecutionStatus;
  inputJson: Record<string, unknown> | null;
  outputJson: unknown;
  logs: string[];
  errorMessage: string | null;
  durationMs: number | null;
  triggeredBy: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class ScriptsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createDefinition(params: {
    workspaceId: string;
    name: string;
    description: string | null;
    language: ScriptLanguage;
    sourceCode: string;
    permissions: ScriptPermission[];
    createdBy: string;
  }): Promise<ScriptDefinitionRow> {
    const rows = await this.prisma.$queryRaw<ScriptDefinitionRow[]>`
      INSERT INTO "script_definitions"
        ("id", "workspaceId", "name", "description", "language", "sourceCode", "permissions", "createdBy", "updatedAt")
      VALUES
        (${randomUUID()}, ${params.workspaceId}, ${params.name}, ${params.description}, ${params.language}::"ScriptLanguage", ${params.sourceCode}, ${params.permissions}, ${params.createdBy}, now())
      RETURNING *
    `;
    return rows[0]!;
  }

  async updateDefinition(
    id: string,
    workspaceId: string,
    patch: Partial<{
      name: string;
      description: string | null;
      language: ScriptLanguage;
      sourceCode: string;
      permissions: ScriptPermission[];
    }>,
  ): Promise<ScriptDefinitionRow | null> {
    const nameFrag = patch.name !== undefined ? Prisma.sql`"name" = ${patch.name},` : Prisma.empty;
    const descFrag = patch.description !== undefined ? Prisma.sql`"description" = ${patch.description},` : Prisma.empty;
    const langFrag =
      patch.language !== undefined ? Prisma.sql`"language" = ${patch.language}::"ScriptLanguage",` : Prisma.empty;
    const sourceFrag = patch.sourceCode !== undefined ? Prisma.sql`"sourceCode" = ${patch.sourceCode},` : Prisma.empty;
    const permsFrag = patch.permissions !== undefined ? Prisma.sql`"permissions" = ${patch.permissions},` : Prisma.empty;

    const rows = await this.prisma.$queryRaw<ScriptDefinitionRow[]>(
      Prisma.sql`
        UPDATE "script_definitions"
        SET ${nameFrag} ${descFrag} ${langFrag} ${sourceFrag} ${permsFrag} "updatedAt" = now()
        WHERE "id" = ${id} AND "workspaceId" = ${workspaceId}
        RETURNING *
      `,
    );
    return rows[0] ?? null;
  }

  async deleteDefinition(id: string, workspaceId: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      DELETE FROM "script_definitions" WHERE "id" = ${id} AND "workspaceId" = ${workspaceId} RETURNING "id"
    `;
    return rows.length > 0;
  }

  async findDefinitionById(id: string): Promise<ScriptDefinitionRow | null> {
    const rows = await this.prisma.$queryRaw<ScriptDefinitionRow[]>`
      SELECT * FROM "script_definitions" WHERE "id" = ${id} LIMIT 1
    `;
    return rows[0] ?? null;
  }

  async listDefinitions(workspaceId: string): Promise<ScriptDefinitionRow[]> {
    return this.prisma.$queryRaw<ScriptDefinitionRow[]>`
      SELECT * FROM "script_definitions" WHERE "workspaceId" = ${workspaceId} ORDER BY "name" ASC
    `;
  }

  async createExecution(params: {
    scriptDefinitionId: string;
    workspaceId: string;
    input: Record<string, unknown> | null;
    triggeredBy: string | null;
  }): Promise<ScriptExecutionRow> {
    const rows = await this.prisma.$queryRaw<ScriptExecutionRow[]>`
      INSERT INTO "script_executions"
        ("id", "scriptDefinitionId", "workspaceId", "status", "inputJson", "logs", "triggeredBy")
      VALUES
        (${randomUUID()}, ${params.scriptDefinitionId}, ${params.workspaceId}, 'RUNNING'::"ScriptExecutionStatus", ${params.input ? JSON.stringify(params.input) : null}::jsonb, ${[]}, ${params.triggeredBy})
      RETURNING *
    `;
    return rows[0]!;
  }

  async finishExecution(params: {
    id: string;
    status: ScriptExecutionStatus;
    output: unknown;
    logs: string[];
    errorMessage: string | null;
    durationMs: number;
    startedAt: Date;
  }): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "script_executions"
      SET "status" = ${params.status}::"ScriptExecutionStatus",
          "outputJson" = ${params.output !== undefined ? JSON.stringify(params.output) : null}::jsonb,
          "logs" = ${params.logs},
          "errorMessage" = ${params.errorMessage},
          "durationMs" = ${params.durationMs},
          "startedAt" = ${params.startedAt},
          "finishedAt" = now()
      WHERE "id" = ${params.id}
    `;
  }

  async findExecutionById(id: string): Promise<ScriptExecutionRow | null> {
    const rows = await this.prisma.$queryRaw<ScriptExecutionRow[]>`
      SELECT * FROM "script_executions" WHERE "id" = ${id} LIMIT 1
    `;
    return rows[0] ?? null;
  }

  async listExecutions(params: {
    scriptDefinitionId: string;
    status?: ScriptExecutionStatus;
    limit: number;
  }): Promise<ScriptExecutionRow[]> {
    const statusFilter = params.status ? Prisma.sql`AND "status" = ${params.status}::"ScriptExecutionStatus"` : Prisma.empty;
    return this.prisma.$queryRaw<ScriptExecutionRow[]>(
      Prisma.sql`
        SELECT * FROM "script_executions"
        WHERE "scriptDefinitionId" = ${params.scriptDefinitionId} ${statusFilter}
        ORDER BY "createdAt" DESC
        LIMIT ${params.limit}
      `,
    );
  }
}
