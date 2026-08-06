import { DEVELOPER_PORTAL_ENDPOINTS } from '@pentesthub/shared';
import type { DeveloperPortalCatalogDto, TryToolCallResultDto } from '@pentesthub/shared';
import { loadConfig } from '../config.js';
import { buildHttpClient } from '../http.js';

/// `pentesthub mcp *` — goes through the Developer Portal's catalog/
/// try-it-out endpoints (task #291), not a raw MCP JSON-RPC session:
/// the CLI is a REST client, so there's no persistent `initialize`d MCP
/// session to hold open between commands. A future `pentesthub mcp
/// serve` (stdio-transport bridge) would be the natural place to add a
/// real session — out of scope for this pass, see the CLI README.
export async function mcpListToolsCommand(): Promise<void> {
  const http = buildHttpClient(loadConfig());
  const catalog = await http.get<DeveloperPortalCatalogDto>(DEVELOPER_PORTAL_ENDPOINTS.catalog);
  for (const tool of catalog.tools) {
    console.log(`${tool.name}\t${tool.description}`);
  }
}

export async function mcpCallToolCommand(args: string[]): Promise<void> {
  const toolName = args[0];
  if (!toolName) throw new Error('Usage: pentesthub mcp call <toolName> [--args \'{"key":"value"}\']');
  const argsFlagIndex = args.indexOf('--args');
  const argsJson = argsFlagIndex !== -1 ? args[argsFlagIndex + 1] : undefined;
  const toolArguments = argsJson ? (JSON.parse(argsJson) as Record<string, unknown>) : undefined;

  const http = buildHttpClient(loadConfig());
  const result = await http.post<TryToolCallResultDto>(DEVELOPER_PORTAL_ENDPOINTS.tryToolCall(toolName), {
    arguments: toolArguments,
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.isError) process.exitCode = 1;
}

export async function mcpCatalogCommand(): Promise<void> {
  const http = buildHttpClient(loadConfig());
  const catalog = await http.get<DeveloperPortalCatalogDto>(DEVELOPER_PORTAL_ENDPOINTS.catalog);
  console.log(JSON.stringify(catalog, null, 2));
}
