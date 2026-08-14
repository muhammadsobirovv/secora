// Module 15 — Plugin permission declarations + enforcement (task #334).
//
// This is a deliberately SEPARATE vocabulary from the Script Engine's
// existing `SCRIPT_PERMISSIONS` (packages/shared/src/script-engine.ts,
// colon-notation: "ai:invoke", "findings:write", ...). Module 15's spec
// asks for a specific dot-notation permission catalog
// ("project.read", "ai.invoke", "mcp.use", ...) for the Plugin
// Marketplace specifically; unifying the two vocabularies would mean
// either renaming every existing `SCRIPT_PERMISSIONS` string (breaking
// Module 13's `ScriptEngineService`/`AgentSdkRunnerService` call sites)
// or aliasing silently (inviting drift). Keeping them separate, both
// documented here and in docs/adr/0015-..., is the smaller and more
// honest change. See docs/adr/0015-production-hardening-monetization-marketplace.md
// §"Plugin permissions vs. Script Engine permissions" for the full
// reasoning.

export const PLUGIN_PERMISSIONS = [
  "project.read",
  "project.write",
  "target.read",
  "target.write",
  "finding.read",
  "finding.write",
  "filesystem.read",
  "filesystem.write",
  "network.connect",
  "process.execute",
  "ai.invoke",
  "mcp.use",
  "workflow.execute",
] as const;
export type PluginPermission = (typeof PLUGIN_PERMISSIONS)[number];

export const PLUGIN_PERMISSION_DESCRIPTIONS: Record<PluginPermission, string> = {
  "project.read": "Read projects in the installing workspace.",
  "project.write": "Create or modify projects in the installing workspace.",
  "target.read": "Read targets in the installing workspace.",
  "target.write": "Create or modify targets in the installing workspace.",
  "finding.read": "Read recon/vulnerability/bug-bounty findings.",
  "finding.write": "Create or modify findings.",
  "filesystem.read": "Read files from the plugin's own sandboxed storage area.",
  "filesystem.write": "Write files to the plugin's own sandboxed storage area.",
  "network.connect": "Make outbound HTTP requests. Disabled by default even when granted — see PluginSandboxService.",
  "process.execute": "Spawn a subprocess. Not implemented in this pass — declaring or granting it has no effect yet (see known limitations).",
  "ai.invoke": "Call the platform's AI abstraction on the installing workspace's behalf (subject to that workspace's AI cost-control budget).",
  "mcp.use": "Call MCP tools/resources exposed by this platform's MCP server.",
  "workflow.execute": "Trigger a Workflow Builder run.",
};

/// What an org admin actually granted at install time — the request/
/// response shape for `PluginPermissionsController`.
export interface PluginPermissionGrantDto {
  permission: PluginPermission;
  grantedByUserId: string;
  grantedAt: string;
}

export interface GrantPluginPermissionsRequestDto {
  pluginInstallationId: string;
  /// Must be a subset of the target `PluginVersion.permissions`
  /// declaration — `PluginPermissionEnforcer` rejects granting anything
  /// the plugin never declared it wanted.
  permissions: PluginPermission[];
}

export interface PluginPermissionStatusDto {
  pluginInstallationId: string;
  declared: string[];
  granted: PluginPermissionGrantDto[];
  /// Declared but not yet granted — what the install-time consent screen
  /// still needs a decision on.
  pending: string[];
}
