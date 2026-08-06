// Module 13 — Developer Portal (task #291). A read-only discovery +
// try-it-out surface over the MCP catalog for third-party developers
// building on the Agent SDK/Script Engine/Plugin SDK/CLI — everything
// here is a thin aggregation over MCP Server core (task #276-279); this
// module never introduces new business capabilities of its own.

import type { McpPromptDescriptor, McpResourceDescriptor, McpToolDescriptor } from "./mcp.js";

export interface DeveloperPortalCatalogDto {
  tools: McpToolDescriptor[];
  resources: McpResourceDescriptor[];
  prompts: McpPromptDescriptor[];
}

/// A *real* tool invocation, not a dry-run — there is no separate
/// "sandbox" execution path from the one `POST /mcp/rpc`'s `tools/call`
/// uses (a `create_finding` test call really creates a finding). Named
/// "try it out" rather than "sandbox" in the API surface to avoid
/// implying isolation that doesn't exist; see the Developer Guide's
/// Developer Portal section for the full disclosure.
export interface TryToolCallRequestDto {
  arguments?: Record<string, unknown>;
}

export interface TryToolCallResultDto {
  toolName: string;
  isError: boolean;
  output: unknown;
  durationMs: number;
}
