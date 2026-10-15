// Module 13 — the Secora-specific MCP Resource/Tool catalog. `mcp.ts`
// is the protocol envelope; this file is "what does this server actually
// expose", consumed by both `apps/api/src/modules/mcp` (the real
// implementation) and the Developer Portal's API Explorer (a read-only
// listing of the same catalog, so the docs page can never drift from
// what the server actually serves — it imports this file, not a
// hand-maintained duplicate table).

// ---- Resources (task #278) ----

/// URI scheme: `pentesthub://{workspaceId}/{resourceType}` (collection)
/// or `pentesthub://{workspaceId}/{resourceType}/{id}` (single item).
/// Every resource type below is a *read* over an existing service this
/// repository already has — Projects (Module 2), Targets (Module 2),
/// Findings (Module 4/6), Evidence (Module 2), Reports (Module 6),
/// Notes (Module 2), Knowledge Base (Module 6/11), Recon/Scanner
/// Results (Module 3/4), Activity Timeline (Module 2), Workspace
/// Settings (Module 2), AI Memory (Module 11), RAG Documents (Module 5)
/// — `McpResourceRegistryService` never duplicates a data layer, only
/// adds a read-only MCP-shaped view over each one.
export const MCP_RESOURCE_TYPES = [
  "projects",
  "targets",
  "findings",
  "evidence",
  "reports",
  "notes",
  "knowledge-base",
  "recon-results",
  "scanner-results",
  "activity",
  "workspace-settings",
  "ai-memory",
  "rag-documents",
] as const;
export type McpResourceType = (typeof MCP_RESOURCE_TYPES)[number];

export function buildMcpResourceUri(workspaceId: string, type: McpResourceType, id?: string): string {
  return id ? `pentesthub://${workspaceId}/${type}/${id}` : `pentesthub://${workspaceId}/${type}`;
}

export interface ParsedMcpResourceUri {
  workspaceId: string;
  type: McpResourceType;
  id: string | null;
}

/// Returns `null` (not a throw) for a malformed/unrecognized URI — every
/// caller (`ReadResourceHandler`, tool-argument validators) treats an
/// unparsable URI as a normal "not found" rather than a server error.
export function parseMcpResourceUri(uri: string): ParsedMcpResourceUri | null {
  const match = /^pentesthub:\/\/([^/]+)\/([^/]+)(?:\/(.+))?$/.exec(uri);
  if (!match) return null;
  const workspaceId = match[1];
  const rawType = match[2];
  const id = match[3];
  if (!workspaceId || !rawType || !(MCP_RESOURCE_TYPES as readonly string[]).includes(rawType)) return null;
  return { workspaceId, type: rawType as McpResourceType, id: id ?? null };
}

// ---- Tools (task #279) ----

/// Every tool the spec's "MCP Tools" section names, mapped 1:1 to the
/// use-case/command class that actually performs the action —
/// `McpToolRegistryService`'s catalog. `manage_findings` covers the
/// spec's plural "Manage Findings" line item as one tool with an
/// `action` argument (`update_stage` | `assign` | `add_note`) rather
/// than one tool per finding mutation, matching how few, wide tools
/// tend to work better for an LLM tool-caller than many narrow ones.
export const MCP_TOOL_NAMES = [
  "create_project",
  "create_target",
  "run_recon",
  "launch_scan",
  "generate_report",
  "create_note",
  "search_knowledge",
  "ask_ai",
  "generate_payload",
  "create_workflow",
  "manage_findings",
  "export_report",
  "upload_evidence",
  "desktop_agent_command",
  "browser_extension_command",
] as const;
export type McpToolName = (typeof MCP_TOOL_NAMES)[number];

// ---- Prompts (Prompt Registry surfaced over MCP) ----

/// The Prompt Registry (task #280) is surfaced over MCP as
/// `prompts/list`+`prompts/get` using this fixed prefix plus the
/// `PromptTemplate.name` — an MCP host's prompt picker can show every
/// workspace prompt without a Secora-specific integration.
export const MCP_PROMPT_NAME_PREFIX = "pentesthub:";
