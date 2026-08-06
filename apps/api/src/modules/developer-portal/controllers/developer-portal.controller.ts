import { Body, Controller, Get, HttpStatus, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { QueryBus } from '@nestjs/cqrs';
import { Throttle } from '@nestjs/throttler';
import type {
  AiPlatformObservabilityDto,
  DeveloperPortalCatalogDto,
  TryToolCallRequestDto,
  TryToolCallResultDto,
} from '@pentesthub/shared';
import { MCP_TOOL_NAMES } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import { McpToolRegistryService } from '../../mcp/mcp-tool-registry.service.js';
import { McpResourceRegistryService } from '../../mcp/mcp-resource-registry.service.js';
import { McpPromptRegistryService } from '../../mcp/mcp-prompt-registry.service.js';
import { GetAiPlatformObservabilityQuery } from '../../observability/queries/ai-platform-observability.query.js';

/// Module 13 — Developer Portal (task #291). A read-only discovery layer
/// for third-party developers (Plugin SDK authors, CLI users, Script
/// Engine authors) — every response here is assembled from the exact
/// registries `POST /mcp/rpc` already dispatches to (`McpToolRegistryService`
/// /`McpResourceRegistryService`/`McpPromptRegistryService`), so the
/// catalog can never drift from what `tools/list`/`resources/list`/
/// `prompts/list` actually returns. `usage` reuses Observability's
/// `GetAiPlatformObservabilityQuery` via `QueryBus.execute()` — CQRS
/// dispatch needs no module-to-module DI import beyond both handlers
/// being registered somewhere in `AppModule` (same pattern
/// `EnqueueRelayCommandCommand` already established).
@ApiTags('developer-portal')
@ApiBearerAuth()
@Controller('developer-portal')
export class DeveloperPortalController {
  constructor(
    @Inject(WORKSPACES_REPOSITORY) private readonly workspacesRepository: WorkspacesRepository,
    private readonly tools: McpToolRegistryService,
    private readonly resources: McpResourceRegistryService,
    private readonly prompts: McpPromptRegistryService,
    private readonly queryBus: QueryBus,
  ) {}

  private async resolveWorkspaceId(userId: string): Promise<string> {
    const workspace = await this.workspacesRepository.findPersonalWorkspaceForUser(userId);
    if (!workspace) {
      throw new AppException('WORKSPACE_NOT_FOUND', 'Workspace not found.', HttpStatus.NOT_FOUND);
    }
    return workspace.id;
  }

  @Get('catalog')
  @ApiOperation({ summary: 'Full MCP catalog (tools + resources + prompts) for third-party developers' })
  async getCatalog(@CurrentUser() user: RequestUser): Promise<DeveloperPortalCatalogDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    const promptsResult = await this.prompts.list(workspaceId);
    return {
      tools: this.tools.listTools(),
      resources: this.resources.listResourceTypes(workspaceId),
      prompts: promptsResult.prompts,
    };
  }

  /// A *real* call, not a dry-run — see `TryToolCallRequestDto`'s doc
  /// comment. Deliberately does not persist an `McpToolInvocation` row
  /// (there is no MCP session behind this REST call) but does still
  /// increment `pentesthub_mcp_tool_invocations_total` indirectly the
  /// next time the same tool runs through a real MCP session; this
  /// try-it-out path itself is intentionally not counted there since
  /// it's a developer testing the shape of a call, not platform traffic.
  @Post('tools/:toolName/try')
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @ApiOperation({ summary: 'Invoke an MCP tool directly (same execution path as tools/call — no session required)' })
  async tryToolCall(
    @Param('toolName') toolName: string,
    @Body() body: TryToolCallRequestDto,
    @CurrentUser() user: RequestUser,
  ): Promise<TryToolCallResultDto> {
    if (!(MCP_TOOL_NAMES as readonly string[]).includes(toolName)) {
      throw new AppException('MCP_TOOL_NOT_FOUND', `Unknown tool "${toolName}".`, HttpStatus.NOT_FOUND);
    }
    const startedAt = Date.now();
    try {
      const output = await this.tools.call(toolName as (typeof MCP_TOOL_NAMES)[number], body.arguments ?? {}, user.id);
      return { toolName, isError: false, output, durationMs: Date.now() - startedAt };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { toolName, isError: true, output: message, durationMs: Date.now() - startedAt };
    }
  }

  @Get('usage')
  @ApiOperation({ summary: 'AI automation platform usage dashboard (alias of GET /observability/ai-platform)' })
  getUsage(
    @Query('sinceDays') sinceDays: string | undefined,
    @CurrentUser() user: RequestUser,
  ): Promise<AiPlatformObservabilityDto> {
    return this.queryBus.execute(new GetAiPlatformObservabilityQuery(user.id, sinceDays ? Number(sinceDays) : undefined));
  }
}
