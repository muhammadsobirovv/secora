// Module 13 — MCP server HTTP routes. `rpc` is the single JSON-RPC
// 2.0 endpoint every MCP method (initialize/resources.list/
// resources.read/tools.list/tools.call/prompts.list/prompts.get) POSTs
// to; `stream` is the same endpoint's SSE counterpart for
// server-initiated notifications (`notifications/resources/updated`,
// etc. — Streaming spec section). The rest are Secora-specific
// management/observability routes, not part of the MCP wire protocol
// itself.

export const MCP_ENDPOINTS = {
  rpc: "/mcp/rpc",
  stream: "/mcp/stream",
  sessions: "/mcp/sessions",
  session: (id: string) => `/mcp/sessions/${id}`,
  closeSession: (id: string) => `/mcp/sessions/${id}/close`,
  resourceCatalog: "/mcp/catalog/resources",
  toolCatalog: "/mcp/catalog/tools",
  promptCatalog: "/mcp/catalog/prompts",
  toolInvocations: "/mcp/tool-invocations",
} as const;
