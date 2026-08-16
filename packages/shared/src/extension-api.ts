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
