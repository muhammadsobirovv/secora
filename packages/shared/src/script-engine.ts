// Module 13 — Script Engine (task #286). A saved script a workspace
// member can run against their own data: read Projects/Targets, run
// tools, generate reports, trigger AI, create findings, access MCP
// resources — all through the same permission-gated `pentesthub.*` API
// `PluginSandboxService` already exposes to plugin hooks, generalized by
// `ScriptEngineService` (apps/api/src/modules/scripts) rather than
// forked. See `ScriptDefinition`/`ScriptExecution`'s Prisma doc comments
// for the Python-not-executable disclosure.

export type ScriptLanguage = "TYPESCRIPT" | "JAVASCRIPT" | "PYTHON";
export type ScriptExecutionStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "TIMEOUT";

/// The permission strings a script can request — the same flat
/// string-scope shape `PluginVersion.permissions`/`ApiKey.scopes` use.
/// `ScriptEngineService.buildApi` only wires a capability into the
/// sandbox's `pentesthub.*` object when the executing
/// `ScriptDefinition.permissions` includes it.
export const SCRIPT_PERMISSIONS = [
  "projects:read",
  "targets:read",
  "findings:read",
  "findings:write",
  "recon:run",
  "reports:generate",
  "ai:invoke",
  "mcp:resources:read",
  "network:fetch",
] as const;
export type ScriptPermission = (typeof SCRIPT_PERMISSIONS)[number];

export interface ScriptDefinitionDto {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  language: ScriptLanguage;
  sourceCode: string;
  permissions: ScriptPermission[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateScriptDefinitionRequestDto {
  name: string;
  description?: string;
  language: ScriptLanguage;
  sourceCode: string;
  permissions: ScriptPermission[];
}

export type UpdateScriptDefinitionRequestDto = Partial<CreateScriptDefinitionRequestDto>;

export interface ScriptExecutionDto {
  id: string;
  scriptDefinitionId: string;
  workspaceId: string;
  status: ScriptExecutionStatus;
  input: Record<string, unknown> | null;
  output: unknown;
  logs: string[];
  errorMessage: string | null;
  durationMs: number | null;
  triggeredBy: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface RunScriptRequestDto {
  input?: Record<string, unknown>;
}

export interface ListScriptExecutionsQueryDto {
  status?: ScriptExecutionStatus;
  limit?: number;
}
