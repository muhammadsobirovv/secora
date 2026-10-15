// Module 13 — Model Context Protocol (MCP) server/client. Types mirror
// the MCP specification's JSON-RPC 2.0 message shapes (see
// docs/mcp/mcp-guide.md for the version this was authored against and
// the sandbox-network caveat on verifying it byte-for-byte against the
// live spec site) closely enough that any MCP-compatible client/host
// can talk to `apps/api/src/modules/mcp`'s server without a Secora-
// specific adapter. Secora-specific meaning (which Resource/Tool
// maps to which internal service) lives in `mcp-resources.ts`/
// `mcp-tools.ts`'s catalog constants, not here — this file is the
// protocol envelope only.

export const MCP_PROTOCOL_VERSION = "2025-06-18";

/// Version Negotiation (spec section): the server advertises every
/// version it understands; a client picks one from the intersection
/// with its own supported list in its `initialize` request. Kept as an
/// array (not just the latest) so a future protocol revision doesn't
/// break older CLI/plugin clients still pinned to this version string.
export const MCP_SUPPORTED_PROTOCOL_VERSIONS = [MCP_PROTOCOL_VERSION] as const;

export interface McpJsonRpcRequest<TParams = unknown> {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: TParams;
}

export interface McpJsonRpcNotification<TParams = unknown> {
  jsonrpc: "2.0";
  method: string;
  params?: TParams;
}

export interface McpJsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface McpJsonRpcResponse<TResult = unknown> {
  jsonrpc: "2.0";
  id: string | number;
  result?: TResult;
  error?: McpJsonRpcError;
}

// Standard JSON-RPC error codes this server returns.
export const MCP_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // MCP-specific, above the JSON-RPC-reserved range.
  UNAUTHORIZED: -32001,
  FORBIDDEN: -32002,
  NOT_FOUND: -32003,
  UNSUPPORTED_PROTOCOL_VERSION: -32004,
} as const;

export interface McpClientCapabilities {
  sampling?: Record<string, never>;
  roots?: { listChanged?: boolean };
}

export interface McpServerCapabilities {
  resources?: { subscribe?: boolean; listChanged?: boolean };
  tools?: { listChanged?: boolean };
  prompts?: { listChanged?: boolean };
  logging?: Record<string, never>;
}

export interface McpInitializeRequestParams {
  protocolVersion: string;
  capabilities: McpClientCapabilities;
  clientInfo: { name: string; version?: string };
}

export interface McpInitializeResult {
  protocolVersion: string;
  capabilities: McpServerCapabilities;
  serverInfo: { name: string; version: string };
  /// Not part of the base MCP spec — Secora-specific, returned so a
  /// client can display/persist which live session this `initialize`
  /// call produced (used by `mcp/sessions` observability views).
  sessionId: string;
}

// ---- Resources ----

export interface McpResourceDescriptor {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpListResourcesResult {
  resources: McpResourceDescriptor[];
  nextCursor?: string | null;
}

export interface McpReadResourceRequestParams {
  uri: string;
}

export interface McpResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

export interface McpReadResourceResult {
  contents: McpResourceContent[];
}

// ---- Tools ----

export interface McpToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpListToolsResult {
  tools: McpToolDescriptor[];
  nextCursor?: string | null;
}

export interface McpCallToolRequestParams {
  name: string;
  arguments?: Record<string, unknown>;
}

export interface McpToolResultContent {
  type: "text" | "json";
  text: string;
}

export interface McpCallToolResult {
  content: McpToolResultContent[];
  isError: boolean;
}

// ---- Prompts ----

export interface McpPromptArgumentDescriptor {
  name: string;
  description?: string;
  required?: boolean;
}

export interface McpPromptDescriptor {
  name: string;
  description?: string;
  arguments?: McpPromptArgumentDescriptor[];
}

export interface McpListPromptsResult {
  prompts: McpPromptDescriptor[];
  nextCursor?: string | null;
}

export interface McpGetPromptRequestParams {
  name: string;
  arguments?: Record<string, string>;
}

export interface McpPromptMessage {
  role: "user" | "assistant";
  content: { type: "text"; text: string };
}

export interface McpGetPromptResult {
  description?: string;
  messages: McpPromptMessage[];
}

// ---- Session / observability DTOs (Secora-specific, not MCP-spec) ----

export type McpSessionStatus = "ACTIVE" | "CLOSED" | "EXPIRED";
export type McpTransport = "http_sse" | "stdio";

export interface McpSessionDto {
  id: string;
  workspaceId: string;
  clientName: string;
  clientVersion: string | null;
  protocolVersion: string;
  transport: McpTransport;
  status: McpSessionStatus;
  scopes: string[];
  createdAt: string;
  lastActiveAt: string;
  closedAt: string | null;
}

export interface McpToolInvocationDto {
  id: string;
  sessionId: string;
  toolName: string;
  errorMessage: string | null;
  durationMs: number;
  createdAt: string;
}

export interface ListMcpSessionsQueryDto {
  status?: McpSessionStatus;
  limit?: number;
}

// ---- Permission System ----

/// MCP scopes reuse the Public API's `ApiKey.scopes` string shape
/// (Module 9) rather than inventing a parallel permission model — an API
/// key minted with `mcp:*` scopes can drive the MCP server; one minted
/// with only e.g. `mcp:resources:read` can list/read resources but not
/// call tools. `MCP_SCOPES` is the closed catalog `ApiKeysController`'s
/// create-key form and `McpPermissionGuard` both validate against.
export const MCP_SCOPES = [
  "mcp:resources:read",
  "mcp:tools:call",
  "mcp:prompts:read",
  "mcp:*",
] as const;
export type McpScope = (typeof MCP_SCOPES)[number];
