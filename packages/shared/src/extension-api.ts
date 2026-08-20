// Module 16 — Extension API registry (task #401). Complements the
// existing M13 Plugin SDK/Marketplace (Plugin/PluginVersion/
// PluginInstallation/PluginPermissionGrant) rather than replacing it —
// a Marketplace Plugin *is* one of the seven extension point types this
// registry tracks (see ExtensionType), and MARKETPLACE_PLUGIN
// registrations are expected to be backed by a real Plugin/
// PluginInstallation row. The other six extension point types
// (recon/scanner/intelligence providers, AI agents, report templates,
// workflow nodes) are lighter-weight, code-level extension points that
// don't need the full marketplace publishing pipeline, but still need
// declared permissions and enable/disable control.

export type ExtensionType =
  | "RECON_PROVIDER"
  | "SCANNER_PROVIDER"
  | "INTELLIGENCE_PROVIDER"
  | "AI_AGENT"
  | "REPORT_TEMPLATE"
  | "WORKFLOW_NODE"
  | "MARKETPLACE_PLUGIN";

/// A closed, declared permission vocabulary — an extension can only ever
/// be granted permissions from this list, and every capability it
/// exercises at runtime must map to one of them (enforced server-side by
/// ExtensionPermissionEnforcer, not just documented here). Deliberately
/// coarse-grained rather than a free-text string, so "undeclared
/// privilege" is a closed-world check, not a string-matching heuristic.
export type ExtensionPermission =
  | "NETWORK_OUTBOUND"
  | "READ_TARGETS"
  | "READ_FINDINGS"
  | "WRITE_FINDINGS"
  | "READ_EVIDENCE"
  | "WRITE_EVIDENCE"
  | "EXECUTE_TOOL"
  | "READ_AI_MEMORY"
  | "WRITE_AI_MEMORY"
  | "READ_REPORTS"
  | "WRITE_REPORTS";

export interface ExtensionManifestDto {
  name: string;
  version: string;
  type: ExtensionType;
  permissions: ExtensionPermission[];
  capabilities: string[];
  entrypoint: string;
  metadata?: Record<string, unknown>;
}

export interface ExtensionDto extends ExtensionManifestDto {
  id: string;
  enabled: boolean;
  registeredBy: string;
  registeredAt: string;
  updatedAt: string;
}

export interface RegisterExtensionRequestDto {
  name: string;
  version: string;
  type: ExtensionType;
  permissions: ExtensionPermission[];
  capabilities: string[];
  entrypoint: string;
  metadata?: Record<string, unknown>;
}

export interface ListExtensionsQueryDto {
  type?: ExtensionType;
  enabled?: boolean;
}

/// Hardening pass: the real invocation path `ExtensionPermissionEnforcer`
/// was built for but had no caller. `permission` names which of the
/// extension's *declared* permissions this specific call is exercising —
/// the server rejects the call if the extension hasn't declared it (or is
/// disabled), rather than trusting the caller's word for what the call
/// does. `input` is opaque, extension-defined payload forwarded verbatim
/// to `entrypoint`.
export interface InvokeExtensionRequestDto {
  permission: ExtensionPermission;
  input?: Record<string, unknown>;
}

/// Result of a synchronous HTTP call to `entrypoint`. `body` is the
/// entrypoint's raw JSON response (or `undefined` if it didn't return
/// JSON) — this registry does not interpret or validate it, matching the
/// registry's own scope (authorize + relay, not execute).
export interface ExtensionInvocationResultDto {
  ok: boolean;
  statusCode: number | null;
  durationMs: number;
  body?: unknown;
  error?: string;
}
