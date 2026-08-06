// Module 13 — AI Agent SDK (task #281) + the eleven built-in reference
// agents (task #282). Distinct from Module 11's `agent.ts`
// (`AgentType`/`AgentOrchestrationRun`) — that file's twelve specialists
// only ever run inside one Master Orchestrator decomposition; the types
// below back independently invocable, SDK-lifecycle agents any
// workspace (or third-party developer, via an installed `AGENT_PACK`
// Plugin) can register and run on their own. The lifecycle itself
// (Initialize/LoadContext/ReceiveTask/CallTools/ReadResources/
// GenerateResult/PublishEvents/Shutdown) is defined in code, not data —
// see `packages/agent-sdk`'s `AgentLifecycle` interface, which every
// concrete agent (including the eleven built-in ones) implements.

export type AgentSdkKind = "BUILTIN" | "CUSTOM";
export type AgentSdkStatus = "DRAFT" | "ACTIVE" | "DISABLED";

/// The eleven reference agents this module ships (task #282). Each is a
/// thin `AgentLifecycle` implementation in `packages/agent-sdk/src/
/// builtin/`; several delegate their actual analysis to a Module 11
/// specialist's prompt where one already exists for the same domain
/// (e.g. `code_review` reuses `CodeReviewAgent`'s prompt) rather than
/// duplicating prompt engineering — see the SDK Guide's "Built-in
/// agents" table for the exact mapping and which ones are net-new
/// (Threat Modeling Agent, Knowledge Curator, Workflow Agent have no
/// Module 11 counterpart).
export const BUILTIN_AGENT_SLUGS = [
  "recon-agent",
  "web-pentest-agent",
  "api-security-agent",
  "cloud-security-agent",
  "ad-assessment-agent",
  "code-review-agent",
  "threat-modeling-agent",
  "bug-bounty-assistant",
  "report-writer-agent",
  "knowledge-curator-agent",
  "workflow-agent",
] as const;
export type BuiltinAgentSlug = (typeof BUILTIN_AGENT_SLUGS)[number];

export interface AgentSdkManifest {
  entryPoint: string;
  /// Tool/resource permission requests, disclosed at registration time —
  /// mirrors `PluginManifest`'s `hooks`/`PluginVersion.permissions`
  /// disclose-before-grant shape. A `CUSTOM` agent's manifest declares
  /// which MCP tools (`mcp.ts`'s tool-name catalog) and MCP resource URI
  /// prefixes it needs; `AgentSdkRunner` rejects a `callTool`/
  /// `readResource` call outside this list at runtime, the same way
  /// `PromptDrivenAgent` rejects an out-of-allowlist tool call today.
  requestedTools: string[];
  requestedResourcePrefixes: string[];
  configSchema?: Record<string, unknown>;
}

export interface AgentSdkDefinitionDto {
  id: string;
  organizationId: string | null;
  workspaceId: string | null;
  pluginId: string | null;
  slug: string;
  name: string;
  description: string;
  kind: AgentSdkKind;
  status: AgentSdkStatus;
  manifest: AgentSdkManifest;
  permissions: string[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterAgentSdkDefinitionRequestDto {
  workspaceId?: string;
  slug: string;
  name: string;
  description: string;
  manifest: AgentSdkManifest;
  /// The agent's TypeScript source (a module exporting a default
  /// `AgentLifecycle` implementation) — executed the same
  /// `node:vm`-sandboxed way `ScriptEngineService`/`PluginSandboxService`
  /// run any other untrusted code this platform accepts. Omitted for
  /// `BUILTIN` agents (their source ships in this repository, not the
  /// database).
  sourceCode?: string;
  permissions: string[];
}

export type AgentSdkRunStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";

export interface AgentSdkLifecycleEvent {
  phase:
    | "initialize"
    | "load_context"
    | "receive_task"
    | "call_tool"
    | "read_resource"
    | "generate_result"
    | "publish_event"
    | "shutdown";
  at: string;
  detail?: Record<string, unknown>;
}

export interface AgentSdkRunDto {
  id: string;
  agentSdkDefinitionId: string;
  workspaceId: string;
  projectId: string | null;
  status: AgentSdkRunStatus;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  events: AgentSdkLifecycleEvent[];
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface StartAgentSdkRunRequestDto {
  agentSdkDefinitionId: string;
  projectId?: string;
  input?: Record<string, unknown>;
}

export interface ListAgentSdkRunsQueryDto {
  agentSdkDefinitionId?: string;
  status?: AgentSdkRunStatus;
  limit?: number;
}
