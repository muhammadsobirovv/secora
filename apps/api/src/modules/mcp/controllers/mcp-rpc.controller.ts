import { Body, Controller, HttpStatus, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { McpJsonRpcRequest, McpJsonRpcResponse, McpInitializeRequestParams } from '@pentesthub/shared';
import { MCP_ERROR_CODES } from '@pentesthub/shared';
import type { EnvConfig } from '../../../config/env.validation.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { Public } from '../../../common/decorators/public.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { ApiKeyAuthGuard } from '../../public-api/guards/api-key-auth.guard.js';
import { McpRpcDispatcherService } from '../mcp-rpc-dispatcher.service.js';

type McpAugmentedRequest = Request & { apiKeyScopes?: string[]; apiKeyWorkspaceId?: string | null };

/// MCP Server transport (task #276) — the single JSON-RPC 2.0 endpoint
/// every MCP method POSTs to (Streaming's server-push half lives on the
/// same session via `GET /mcp/stream`, not implemented as a second
/// controller method here since this pass's tool calls are all
/// request/response, not long-running — see the MCP Guide's Streaming
/// section for the documented gap). Authenticated via `X-API-Key`
/// (`ApiKeyAuthGuard`, Module 9) exactly like every other machine-facing
/// route in this codebase (`WorkerJobsController`, Module 10) — an
/// MCP-compatible client authenticates the same way any other Public API
/// consumer does, no new auth mechanism invented for this module.
@ApiTags('mcp')
@Controller('mcp')
export class McpRpcController {
  constructor(
    private readonly dispatcher: McpRpcDispatcherService,
    @Inject(ConfigService) private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  @Post('rpc')
  @Public()
  @UseGuards(ApiKeyAuthGuard)
  @ApiSecurity('apiKey')
  @ApiOperation({ summary: 'MCP JSON-RPC 2.0 endpoint (initialize/resources/tools/prompts) — X-API-Key' })
  async rpc(
    @Body() request: McpJsonRpcRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: McpAugmentedRequest,
  ): Promise<McpJsonRpcResponse> {
    if (!this.configService.get('MCP_SERVER_ENABLED', { infer: true })) {
      throw new AppException('MCP_SERVER_DISABLED', 'The MCP server is disabled on this deployment.', HttpStatus.SERVICE_UNAVAILABLE);
    }
    const workspaceId = req.apiKeyWorkspaceId;
    if (!workspaceId) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: { code: MCP_ERROR_CODES.INVALID_REQUEST, message: 'This API key has no workspace — mint a workspace-scoped key to use the MCP server.' },
      };
    }
    const scopes = req.apiKeyScopes ?? [];

    if (request.method === 'initialize') {
      const result = await this.dispatcher.initialize(
        request.params as McpInitializeRequestParams,
        workspaceId,
        null,
        scopes,
        'http_sse',
      );
      return { jsonrpc: '2.0', id: request.id, result };
    }

    // Every non-initialize method expects an already-established
    // session id, passed by the client as `params.sessionId` (MCP's base
    // spec doesn't mandate a specific transport-level session header, so
    // this follows the same "put it in params" shape the spec's own
    // reference HTTP transport examples use).
    const params = (request.params ?? {}) as Record<string, unknown>;
    const sessionId = typeof params.sessionId === 'string' ? params.sessionId : null;

    return this.dispatcher.dispatch(request, { sessionId, workspaceId, userId: user.id, scopes });
  }
}
