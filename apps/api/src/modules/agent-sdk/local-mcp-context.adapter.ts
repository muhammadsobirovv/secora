import type { AgentRuntimeBackend } from '@pentesthub/agent-sdk';
import type { McpToolCallResult } from '@pentesthub/sdk';
import type { McpToolName } from '@pentesthub/shared';
import { MCP_TOOL_NAMES } from '@pentesthub/shared';
import { McpToolRegistryService } from '../mcp/mcp-tool-registry.service.js';
import { McpResourceRegistryService } from '../mcp/mcp-resource-registry.service.js';

/// Module 13 — AI Agent SDK (task #281). Implements the SDK's
/// `AgentRuntimeBackend` seam directly against the MCP server's own
/// registries (`McpToolRegistryService`/`McpResourceRegistryService`)
/// rather than going out over HTTP to this same process's `/mcp/rpc`
/// endpoint (`HttpAgentRuntimeBackend`, used by every *external* SDK
/// consumer). Same request/response shape either way — a third-party
/// agent written against `McpClient` and a built-in agent running
/// through this adapter see an identical `AgentLifecycleContext`, only
/// the transport differs.
export class LocalMcpContextAdapter implements AgentRuntimeBackend {
  constructor(
    private readonly tools: McpToolRegistryService,
    private readonly resources: McpResourceRegistryService,
    private readonly userId: string,
  ) {}

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<McpToolCallResult> {
    if (!(MCP_TOOL_NAMES as readonly string[]).includes(name)) {
      return { content: [{ type: 'text', text: `Unknown tool "${name}".` }], isError: true };
    }
    try {
      const output = await this.tools.call(name as McpToolName, args, this.userId);
      return { content: [{ type: 'json', text: JSON.stringify(output) }], isError: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: 'text', text: message }], isError: true };
    }
  }

  async readResource(uri: string): Promise<unknown> {
    const contents = await this.resources.readResource(uri);
    const text = contents?.[0]?.text;
    return text ? JSON.parse(text) : null;
  }
}
