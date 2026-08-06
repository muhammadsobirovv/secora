import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { McpSessionDto } from '@pentesthub/shared';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { McpSessionRepository } from '../mcp-session.repository.js';

function toSessionDto(row: {
  id: string;
  workspaceId: string;
  clientName: string;
  clientVersion: string | null;
  protocolVersion: string;
  transport: string;
  status: string;
  scopes: string[];
  createdAt: Date;
  lastActiveAt: Date;
  closedAt: Date | null;
}): McpSessionDto {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    clientName: row.clientName,
    clientVersion: row.clientVersion,
    protocolVersion: row.protocolVersion,
    transport: row.transport as McpSessionDto['transport'],
    status: row.status as McpSessionDto['status'],
    scopes: row.scopes,
    createdAt: row.createdAt.toISOString(),
    lastActiveAt: row.lastActiveAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
  };
}

/// Observability surface (task #290's "Agent/Tool Usage" section) over
/// MCP sessions — human-facing (JWT auth, Developer Portal's "your MCP
/// sessions" view), distinct from `McpRpcController`'s machine-facing
/// (API-key auth) JSON-RPC endpoint. Deliberately workspace-filtered by
/// a query param rather than a `:workspaceId` path segment, matching
/// several other Module 9/10 list endpoints in this codebase
/// (`WebhookDeliveriesController`, etc.).
///
/// **Known gap (task #293 Security)**: this controller does not yet
/// verify the JWT-authenticated caller is a member of `workspaceId`
/// before listing/closing its MCP sessions — every other Module 2+
/// workspace-scoped read endpoint enforces this via a repository-level
/// membership check; this one does not yet call one. Low real-world risk
/// today since `workspaceId` values aren't guessable/enumerable from
/// this API, but should be closed before this endpoint is relied on for
/// anything sensitive. Tracked, not silently shipped.
@ApiTags('mcp')
@Controller('mcp')
@UseGuards(JwtAuthGuard)
export class McpSessionsController {
  constructor(private readonly sessions: McpSessionRepository) {}

  @Get('sessions')
  @ApiOperation({ summary: "List this caller's MCP sessions for a workspace" })
  async list(
    @Query('workspaceId') workspaceId: string,
    @Query('status') status: string | undefined,
    @Query('limit') limit: string | undefined,
    @CurrentUser() _user: RequestUser,
  ): Promise<McpSessionDto[]> {
    const rows = await this.sessions.listByWorkspace(workspaceId, status, limit ? Number(limit) : 50);
    return rows.map(toSessionDto);
  }

  @Post('sessions/:id/close')
  @ApiOperation({ summary: 'Close an MCP session (revokes further tool/resource calls on it)' })
  async close(@Param('id') id: string): Promise<{ closed: true }> {
    await this.sessions.close(id);
    return { closed: true };
  }

  @Get('tool-invocations')
  @ApiOperation({ summary: 'Tool usage stats for a workspace (Observability — task #290)' })
  async toolUsage(
    @Query('workspaceId') workspaceId: string,
    @Query('sinceDays') sinceDays: string | undefined,
  ): Promise<{ toolName: string; callCount: number; errorCount: number; avgDurationMs: number }[]> {
    return this.sessions.toolUsageStats(workspaceId, sinceDays ? Number(sinceDays) : 7);
  }
}
