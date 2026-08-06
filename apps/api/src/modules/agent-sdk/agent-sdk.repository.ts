import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { AgentSdkKind, AgentSdkManifest, AgentSdkRunStatus, AgentSdkStatus } from '@pentesthub/shared';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Prisma } from '../../prisma-types.js';

/// Module 13 — AI Agent SDK (task #281). `agent_sdk_definitions`/
/// `agent_sdk_runs` are new Module 13 tables with no generated Prisma
/// Client support — raw SQL only, same constraint and same
/// `Prisma.sql`/`Prisma.empty` pattern as `McpSessionRepository` (see
/// that file's doc comment for the full reasoning).

export interface AgentSdkDefinitionRow {
  id: string;
  organizationId: string | null;
  workspaceId: string | null;
  pluginId: string | null;
  slug: string;
  name: string;
  description: string;
  kind: AgentSdkKind;
  status: AgentSdkStatus;
  manifestJson: AgentSdkManifest;
  sourceCode: string | null;
  permissions: string[];
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAgentSdkDefinitionInput {
  workspaceId: string | null;
  slug: string;
  name: string;
  description: string;
  kind: AgentSdkKind;
  manifest: AgentSdkManifest;
  sourceCode?: string | null;
  permissions: string[];
  createdBy: string | null;
}

export interface AgentSdkRunRow {
  id: string;
  agentSdkDefinitionId: string;
  workspaceId: string;
  projectId: string | null;
  status: AgentSdkRunStatus;
  inputJson: Record<string, unknown> | null;
  outputJson: Record<string, unknown> | null;
  eventsJson: unknown;
  errorMessage: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
}

@Injectable()
export class AgentSdkRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findDefinitionBySlug(workspaceId: string | null, slug: string): Promise<AgentSdkDefinitionRow | null> {
    const workspaceFilter = workspaceId
      ? Prisma.sql`"workspaceId" = ${workspaceId}`
      : Prisma.sql`"workspaceId" IS NULL`;
    const rows = await this.prisma.$queryRaw<AgentSdkDefinitionRow[]>(
      Prisma.sql`SELECT * FROM "agent_sdk_definitions" WHERE ${workspaceFilter} AND "slug" = ${slug} LIMIT 1`,
    );
    return rows[0] ?? null;
  }

  async findDefinitionById(id: string): Promise<AgentSdkDefinitionRow | null> {
    const rows = await this.prisma.$queryRaw<AgentSdkDefinitionRow[]>`
      SELECT * FROM "agent_sdk_definitions" WHERE "id" = ${id} LIMIT 1
    `;
    return rows[0] ?? null;
  }

  /// Built-ins are seeded with `workspaceId = NULL` (visible to every
  /// workspace); `listDefinitions` unions global built-ins with a
  /// workspace's own `CUSTOM` registrations.
  async listDefinitions(workspaceId: string): Promise<AgentSdkDefinitionRow[]> {
    return this.prisma.$queryRaw<AgentSdkDefinitionRow[]>`
      SELECT * FROM "agent_sdk_definitions"
      WHERE "workspaceId" IS NULL OR "workspaceId" = ${workspaceId}
      ORDER BY "kind" ASC, "name" ASC
    `;
  }

  async createDefinition(input: CreateAgentSdkDefinitionInput): Promise<AgentSdkDefinitionRow> {
    const rows = await this.prisma.$queryRaw<AgentSdkDefinitionRow[]>`
      INSERT INTO "agent_sdk_definitions"
        ("id", "workspaceId", "slug", "name", "description", "kind", "status", "manifestJson", "sourceCode", "permissions", "createdBy", "updatedAt")
      VALUES
        (${randomUUID()}, ${input.workspaceId}, ${input.slug}, ${input.name}, ${input.description}, ${input.kind}::"AgentSdkKind", 'ACTIVE'::"AgentSdkStatus", ${JSON.stringify(input.manifest)}::jsonb, ${input.sourceCode ?? null}, ${input.permissions}, ${input.createdBy}, now())
      RETURNING *
    `;
    return rows[0]!;
  }

  async createRun(params: {
    agentSdkDefinitionId: string;
    workspaceId: string;
    projectId: string | null;
    input: Record<string, unknown> | null;
    createdBy: string | null;
  }): Promise<AgentSdkRunRow> {
    const rows = await this.prisma.$queryRaw<AgentSdkRunRow[]>`
      INSERT INTO "agent_sdk_runs"
        ("id", "agentSdkDefinitionId", "workspaceId", "projectId", "status", "inputJson", "createdBy")
      VALUES
        (${randomUUID()}, ${params.agentSdkDefinitionId}, ${params.workspaceId}, ${params.projectId}, 'PENDING'::"AgentSdkRunStatus", ${params.input ? JSON.stringify(params.input) : null}::jsonb, ${params.createdBy})
      RETURNING *
    `;
    return rows[0]!;
  }

  async finishRun(params: {
    id: string;
    status: AgentSdkRunStatus;
    output: Record<string, unknown> | null;
    events: unknown;
    errorMessage: string | null;
    startedAt: Date;
  }): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "agent_sdk_runs"
      SET "status" = ${params.status}::"AgentSdkRunStatus",
          "outputJson" = ${params.output ? JSON.stringify(params.output) : null}::jsonb,
          "eventsJson" = ${JSON.stringify(params.events)}::jsonb,
          "errorMessage" = ${params.errorMessage},
          "startedAt" = ${params.startedAt},
          "finishedAt" = now()
      WHERE "id" = ${params.id}
    `;
  }

  async findRunById(id: string): Promise<AgentSdkRunRow | null> {
    const rows = await this.prisma.$queryRaw<AgentSdkRunRow[]>`
      SELECT * FROM "agent_sdk_runs" WHERE "id" = ${id} LIMIT 1
    `;
    return rows[0] ?? null;
  }

  async listRuns(params: {
    workspaceId: string;
    agentSdkDefinitionId?: string;
    status?: AgentSdkRunStatus;
    limit: number;
  }): Promise<AgentSdkRunRow[]> {
    const defFilter = params.agentSdkDefinitionId
      ? Prisma.sql`AND "agentSdkDefinitionId" = ${params.agentSdkDefinitionId}`
      : Prisma.empty;
    const statusFilter = params.status ? Prisma.sql`AND "status" = ${params.status}::"AgentSdkRunStatus"` : Prisma.empty;
    return this.prisma.$queryRaw<AgentSdkRunRow[]>(
      Prisma.sql`
        SELECT * FROM "agent_sdk_runs"
        WHERE "workspaceId" = ${params.workspaceId} ${defFilter} ${statusFilter}
        ORDER BY "createdAt" DESC
        LIMIT ${params.limit}
      `,
    );
  }
}
