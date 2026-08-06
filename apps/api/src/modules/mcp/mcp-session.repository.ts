import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '../../prisma-types.js';
import { PrismaService } from '../../prisma/prisma.service.js';

/// Raw-SQL repository for `McpSession`/`McpToolInvocation` — like every
/// other Module 13 table, these were added via a hand-authored migration
/// (`prisma/migrations/20260801000000_ai_automation_platform_mcp_
/// ecosystem`), not `prisma generate` (unreachable in this authoring
/// sandbox; see docs/adr/0013-ai-automation-platform-mcp-ecosystem.md
/// §8), so nothing here goes through the typed Prisma Client — same
/// precedent `PrismaAgentOrchestrationRepository` (Module 11) set.
export interface McpSessionRow {
  id: string;
  workspaceId: string;
  apiKeyId: string | null;
  clientName: string;
  clientVersion: string | null;
  protocolVersion: string;
  transport: string;
  status: 'ACTIVE' | 'CLOSED' | 'EXPIRED';
  capabilitiesJson: unknown;
  scopes: string[];
  createdAt: Date;
  lastActiveAt: Date;
  closedAt: Date | null;
}

export interface CreateMcpSessionInput {
  workspaceId: string;
  apiKeyId: string | null;
  clientName: string;
  clientVersion: string | null;
  protocolVersion: string;
  transport: string;
  capabilities: Record<string, unknown>;
  scopes: string[];
}

@Injectable()
export class McpSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateMcpSessionInput): Promise<McpSessionRow> {
    const rows = await this.prisma.$queryRaw<McpSessionRow[]>`
      INSERT INTO "mcp_sessions"
        ("id", "workspaceId", "apiKeyId", "clientName", "clientVersion", "protocolVersion", "transport", "status", "capabilitiesJson", "scopes", "createdAt", "lastActiveAt")
      VALUES
        (${randomUUID()}, ${input.workspaceId}, ${input.apiKeyId}, ${input.clientName}, ${input.clientVersion}, ${input.protocolVersion}, ${input.transport}, 'ACTIVE', ${JSON.stringify(input.capabilities)}::jsonb, ${input.scopes}, now(), now())
      RETURNING *
    `;
    return rows[0];
  }

  async findById(id: string): Promise<McpSessionRow | null> {
    const rows = await this.prisma.$queryRaw<McpSessionRow[]>`
      SELECT * FROM "mcp_sessions" WHERE "id" = ${id}
    `;
    return rows[0] ?? null;
  }

  async touchActive(id: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "mcp_sessions" SET "lastActiveAt" = now() WHERE "id" = ${id}
    `;
  }

  async close(id: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "mcp_sessions" SET "status" = 'CLOSED', "closedAt" = now() WHERE "id" = ${id}
    `;
  }

  async listByWorkspace(workspaceId: string, status: string | undefined, limit: number): Promise<McpSessionRow[]> {
    return this.prisma.$queryRaw<McpSessionRow[]>`
      SELECT * FROM "mcp_sessions"
      WHERE "workspaceId" = ${workspaceId}
        ${status ? Prisma.sql`AND "status" = ${status}::"McpSessionStatus"` : Prisma.empty}
      ORDER BY "lastActiveAt" DESC
      LIMIT ${limit}
    `;
  }

  /// Idle-timeout sweep (env `MCP_SESSION_IDLE_TIMEOUT_MINUTES`) — called
  /// from `McpSessionCleanupService`'s minute tick, same poller-service
  /// shape every other background sweep in this codebase uses.
  async expireIdleSessions(idleMinutes: number): Promise<number> {
    const result = await this.prisma.$executeRaw`
      UPDATE "mcp_sessions"
      SET "status" = 'EXPIRED', "closedAt" = now()
      WHERE "status" = 'ACTIVE' AND "lastActiveAt" < now() - (${idleMinutes} || ' minutes')::interval
    `;
    return result;
  }

  async recordToolInvocation(input: {
    sessionId: string;
    workspaceId: string;
    toolName: string;
    inputJson: Record<string, unknown> | null;
    outputJson: unknown;
    errorMessage: string | null;
    durationMs: number;
  }): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO "mcp_tool_invocations"
        ("id", "sessionId", "workspaceId", "toolName", "inputJson", "outputJson", "errorMessage", "durationMs", "createdAt")
      VALUES
        (${randomUUID()}, ${input.sessionId}, ${input.workspaceId}, ${input.toolName}, ${input.inputJson ? JSON.stringify(input.inputJson) : null}::jsonb, ${input.outputJson ? JSON.stringify(input.outputJson) : null}::jsonb, ${input.errorMessage}, ${input.durationMs}, now())
    `;
  }

  async toolUsageStats(
    workspaceId: string,
    sinceDays: number,
  ): Promise<{ toolName: string; callCount: number; errorCount: number; avgDurationMs: number }[]> {
    return this.prisma.$queryRaw<
      { toolName: string; callCount: number; errorCount: number; avgDurationMs: number }[]
    >`
      SELECT
        "toolName",
        COUNT(*)::int AS "callCount",
        COUNT(*) FILTER (WHERE "errorMessage" IS NOT NULL)::int AS "errorCount",
        AVG("durationMs")::float AS "avgDurationMs"
      FROM "mcp_tool_invocations"
      WHERE "workspaceId" = ${workspaceId} AND "createdAt" > now() - (${sinceDays} || ' days')::interval
      GROUP BY "toolName"
      ORDER BY "callCount" DESC
    `;
  }
}
