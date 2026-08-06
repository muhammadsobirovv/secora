import { Injectable } from '@nestjs/common';
import type {
  McpCallToolRequestParams,
  McpCallToolResult,
  McpGetPromptRequestParams,
  McpGetPromptResult,
  McpInitializeRequestParams,
  McpInitializeResult,
  McpJsonRpcError,
  McpJsonRpcRequest,
  McpJsonRpcResponse,
  McpListPromptsResult,
  McpListResourcesResult,
  McpListToolsResult,
  McpReadResourceRequestParams,
  McpReadResourceResult,
  McpToolName,
} from '@pentesthub/shared';
import { MCP_ERROR_CODES, MCP_PROTOCOL_VERSION, MCP_SUPPORTED_PROTOCOL_VERSIONS, MCP_TOOL_NAMES, parseMcpResourceUri } from '@pentesthub/shared';
import { McpSessionRepository } from './mcp-session.repository.js';
import { McpResourceRegistryService } from './mcp-resource-registry.service.js';
import { McpToolRegistryService } from './mcp-tool-registry.service.js';
import { McpPromptRegistryService } from './mcp-prompt-registry.service.js';
import { MetricsRegistryService } from '../observability/metrics-registry.service.js';

export interface McpRequestContext {
  sessionId: string | null;
  workspaceId: string;
  userId: string;
  scopes: string[];
}

/// The MCP JSON-RPC 2.0 method dispatcher (task #276) — every method the
/// spec's "MCP Server" section lists (Session Management via
/// `initialize`, Resource Registry via `resources/list`+`resources/read`,
/// Tool Registry via `tools/list`+`tools/call`, Prompt Registry via
/// `prompts/list`+`prompts/get`) is one case here. Streaming
/// (server-initiated notifications) and the HTTP/SSE transport itself
/// live in `McpRpcController`, not this class — this class is
/// transport-agnostic so a future stdio transport (for a local CLI/
/// Desktop Agent MCP client, see the CLI Guide) can reuse it unchanged.
/// Version Negotiation happens once, in `initialize`; every later method
/// call on the same session assumes it already succeeded.
@Injectable()
export class McpRpcDispatcherService {
  constructor(
    private readonly sessions: McpSessionRepository,
    private readonly resources: McpResourceRegistryService,
    private readonly tools: McpToolRegistryService,
    private readonly prompts: McpPromptRegistryService,
    private readonly metrics: MetricsRegistryService,
  ) {}

  async initialize(
    params: McpInitializeRequestParams,
    workspaceId: string,
    apiKeyId: string | null,
    scopes: string[],
    transport: string,
  ): Promise<McpInitializeResult> {
    const negotiated = MCP_SUPPORTED_PROTOCOL_VERSIONS.includes(
      params.protocolVersion as (typeof MCP_SUPPORTED_PROTOCOL_VERSIONS)[number],
    )
      ? params.protocolVersion
      : MCP_PROTOCOL_VERSION;

    const session = await this.sessions.create({
      workspaceId,
      apiKeyId,
      clientName: params.clientInfo.name,
      clientVersion: params.clientInfo.version ?? null,
      protocolVersion: negotiated,
      transport,
      capabilities: params.capabilities as Record<string, unknown>,
      scopes,
    });

    return {
      protocolVersion: negotiated,
      capabilities: { resources: { subscribe: false, listChanged: false }, tools: {}, prompts: {} },
      serverInfo: { name: 'pentesthub-mcp-server', version: '13.0.0' },
      sessionId: session.id,
    };
  }

  async dispatch(request: McpJsonRpcRequest, ctx: McpRequestContext): Promise<McpJsonRpcResponse> {
    try {
      const result = await this.route(request, ctx);
      return { jsonrpc: '2.0', id: request.id, result };
    } catch (error) {
      return { jsonrpc: '2.0', id: request.id, error: this.toRpcError(error) };
    }
  }

  private async route(request: McpJsonRpcRequest, ctx: McpRequestContext): Promise<unknown> {
    if (ctx.sessionId) await this.sessions.touchActive(ctx.sessionId);

    switch (request.method) {
      case 'resources/list':
        return this.requireScope(ctx, 'resources', () => Promise.resolve(this.listResources(ctx.workspaceId)));
      case 'resources/read':
        return this.requireScope(ctx, 'resources', () =>
          this.readResource(request.params as McpReadResourceRequestParams, ctx.workspaceId),
        );
      case 'tools/list':
        return this.requireScope(ctx, 'tools', () => Promise.resolve(this.listTools()));
      case 'tools/call':
        return this.requireScope(ctx, 'tools', () => this.callTool(request.params as McpCallToolRequestParams, ctx));
      case 'prompts/list':
        return this.requireScope(ctx, 'prompts', () => this.prompts.list(ctx.workspaceId));
      case 'prompts/get':
        return this.requireScope(ctx, 'prompts', () =>
          this.prompts.get(request.params as McpGetPromptRequestParams, ctx.workspaceId),
        );
      default:
        throw new McpRpcError(MCP_ERROR_CODES.METHOD_NOT_FOUND, `Unknown method "${request.method}".`);
    }
  }

  private async requireScope<T>(ctx: McpRequestContext, area: 'resources' | 'tools' | 'prompts', fn: () => Promise<T>): Promise<T> {
    const allowed = ctx.scopes.includes('mcp:*') || ctx.scopes.some((s) => s.startsWith(`mcp:${area}:`));
    if (!allowed) {
      throw new McpRpcError(MCP_ERROR_CODES.FORBIDDEN, `This session's API key has no "mcp:${area}:*" scope.`);
    }
    return fn();
  }

  private listResources(workspaceId: string): McpListResourcesResult {
    return { resources: this.resources.listResourceTypes(workspaceId), nextCursor: null };
  }

  private async readResource(params: McpReadResourceRequestParams, workspaceId: string): Promise<McpReadResourceResult> {
    const parsed = parseMcpResourceUri(params.uri);
    if (!parsed || parsed.workspaceId !== workspaceId) {
      // Deliberately the same error whether the URI is malformed or
      // belongs to a different workspace — never confirm/deny that a
      // *different* workspace's resource exists to a caller who isn't
      // scoped to it.
      throw new McpRpcError(MCP_ERROR_CODES.NOT_FOUND, `Resource "${params.uri}" not found.`);
    }
    const contents = await this.resources.readResource(params.uri);
    if (!contents) throw new McpRpcError(MCP_ERROR_CODES.NOT_FOUND, `Resource "${params.uri}" not found.`);
    return { contents };
  }

  private listTools(): McpListToolsResult {
    return { tools: this.tools.listTools(), nextCursor: null };
  }

  private async callTool(params: McpCallToolRequestParams, ctx: McpRequestContext): Promise<McpCallToolResult> {
    if (!(MCP_TOOL_NAMES as readonly string[]).includes(params.name)) {
      throw new McpRpcError(MCP_ERROR_CODES.INVALID_PARAMS, `Unknown tool "${params.name}".`);
    }
    const startedAt = Date.now();
    try {
      const output = await this.tools.call(params.name as McpToolName, params.arguments ?? {}, ctx.userId);
      const durationMs = Date.now() - startedAt;
      // Prometheus metrics are recorded for every call regardless of
      // `ctx.sessionId` — unlike `recordToolInvocation` below (which
      // persists a per-session audit trail row and is only meaningful
      // once a session exists), operational tool-health monitoring cares
      // about every invocation, including one-off calls outside an MCP
      // session's lifetime.
      this.metrics.mcpToolInvocationsTotal.inc({ tool: params.name, outcome: 'success' });
      this.metrics.mcpToolInvocationDurationSeconds.observe({ tool: params.name }, durationMs / 1000);
      if (ctx.sessionId) {
        await this.sessions.recordToolInvocation({
          sessionId: ctx.sessionId,
          workspaceId: ctx.workspaceId,
          toolName: params.name,
          inputJson: params.arguments ?? null,
          outputJson: output,
          errorMessage: null,
          durationMs,
        });
      }
      return { content: [{ type: 'json', text: JSON.stringify(output) }], isError: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const durationMs = Date.now() - startedAt;
      this.metrics.mcpToolInvocationsTotal.inc({ tool: params.name, outcome: 'error' });
      this.metrics.mcpToolInvocationDurationSeconds.observe({ tool: params.name }, durationMs / 1000);
      if (ctx.sessionId) {
        await this.sessions.recordToolInvocation({
          sessionId: ctx.sessionId,
          workspaceId: ctx.workspaceId,
          toolName: params.name,
          inputJson: params.arguments ?? null,
          outputJson: null,
          errorMessage: message,
          durationMs,
        });
      }
      return { content: [{ type: 'text', text: message }], isError: true };
    }
  }

  private toRpcError(error: unknown): McpJsonRpcError {
    if (error instanceof McpRpcError) return { code: error.rpcCode, message: error.message };
    const message = error instanceof Error ? error.message : String(error);
    return { code: MCP_ERROR_CODES.INTERNAL_ERROR, message };
  }
}

class McpRpcError extends Error {
  constructor(
    public readonly rpcCode: number,
    message: string,
  ) {
    super(message);
  }
}
