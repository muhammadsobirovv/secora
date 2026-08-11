// Module 10 — Plugin Marketplace. Third-party developers publish
// `Plugin`s (a catalog entry) with one or more `PluginVersion`s (the
// actual installable artifact: a manifest + declared permissions +
// optional digital signature); organizations/workspaces install a
// specific version as a `PluginInstallation`. See
// docs/adr/0010-enterprise-platform.md §Plugin Marketplace for the
// sandbox-execution and signature-verification model.

export type PluginCategory =
  | "RECON"
  | "SCANNERS"
  | "AI_TOOLS"
  | "REPORTING"
  | "INTEGRATIONS"
  | "DASHBOARDS"
  | "UTILITIES"
  // Module 13 — Automation Marketplace (task #287) pack types. Reuse the
  // whole Plugin/PluginVersion/PluginInstallation marketplace machinery
  // (listing, install, ratings, signature verification) instead of a
  // parallel "pack" system.
  | "PROMPT_PACK"
  | "WORKFLOW_PACK"
  | "RECON_PACK"
  | "SCANNER_PACK"
  | "REPORT_TEMPLATE"
  | "PLAYBOOK"
  | "AGENT_PACK"
  | "THEME_PACK"
  | "LANGUAGE_PACK";

export type PluginStatus = "DRAFT" | "PUBLISHED" | "DEPRECATED" | "SUSPENDED";

/// Module 13 — Automation Marketplace (task #287). The subset of
/// `PluginCategory` that represents a "pack" (a bundle of
/// prompts/workflows/recon configs/etc, published and installed through
/// the exact same `Plugin`/`PluginVersion`/`PluginInstallation` flow as
/// any other plugin) rather than executable code. `isPackCategory` lets
/// both the API's marketplace-browsing query and any future frontend
/// "Packs" tab distinguish the two without hand-maintaining the list
/// twice.
export const PACK_CATEGORIES: PluginCategory[] = [
  "PROMPT_PACK",
  "WORKFLOW_PACK",
  "RECON_PACK",
  "SCANNER_PACK",
  "REPORT_TEMPLATE",
  "PLAYBOOK",
  "AGENT_PACK",
  "THEME_PACK",
  "LANGUAGE_PACK",
];

export function isPackCategory(category: PluginCategory): boolean {
  return (PACK_CATEGORIES as readonly PluginCategory[]).includes(category);
}

export interface PluginDto {
  id: string;
  organizationId: string | null;
  slug: string;
  name: string;
  category: PluginCategory;
  description: string;
  authorUserId: string;
  status: PluginStatus;
  iconUrl: string | null;
  homepageUrl: string | null;
  repoUrl: string | null;
  documentationMarkdown: string | null;
  verified: boolean;
  downloadCount: number;
  ratingAverage: number;
  ratingCount: number;
  latestVersion: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublishPluginRequestDto {
  slug: string;
  name: string;
  category: PluginCategory;
  description: string;
  iconUrl?: string;
  homepageUrl?: string;
  repoUrl?: string;
  documentationMarkdown?: string;
  /// The first version, published in the same call — a Plugin can't exist
  /// with zero versions.
  version: PublishPluginVersionRequestDto;
}

export interface UpdatePluginRequestDto {
  name?: string;
  description?: string;
  iconUrl?: string;
  homepageUrl?: string;
  repoUrl?: string;
  documentationMarkdown?: string;
  status?: PluginStatus;
}

export interface PluginManifest {
  entryPoint: string;
  /// The exported function names this version implements — a Reporting
  /// plugin might implement `["transformReport"]`, a Recon plugin
  /// `["normalizeFindings"]`. `ExecutePluginHookHandler` validates the
  /// requested hook is in this list before running anything.
  hooks: string[];
  configSchema?: Record<string, unknown>;
  /// Module 13 — Plugin SDK (task #285). Declarative registration: a
  /// plugin *declares* what it contributes to the platform's UI/tool
  /// surfaces here; each capability's `hook` must also appear in
  /// `hooks` above — `validatePluginManifestCapabilities` (apps/api)
  /// enforces this at publish time, so a capability can never reference
  /// a function the sandbox wouldn't actually be able to call.
  /// Deliberately declarative-only, not "arbitrary executable
  /// registration" (a plugin can't inject a live React component or a
  /// real CommandBus handler) — the same sandboxing posture
  /// `PluginSandboxService` already applies to hook execution extends
  /// naturally to "the platform decides how to render/wire each
  /// declared capability, the plugin only supplies data + a hook to
  /// call when it's activated."
  capabilities?: PluginCapabilities;
}

export interface PluginCapabilities {
  commands?: PluginCommandCapability[];
  tools?: PluginToolCapability[];
  resources?: PluginResourceCapability[];
  prompts?: PluginPromptCapability[];
  workflows?: PluginWorkflowCapability[];
  pages?: PluginPageCapability[];
  widgets?: PluginWidgetCapability[];
  sidebarItems?: PluginSidebarItemCapability[];
  dashboardWidgets?: PluginDashboardWidgetCapability[];
}

/// Shared base every capability item has — `id` unique within its own
/// list (not globally), `hook` naming which of `PluginManifest.hooks`
/// runs when the platform activates this capability (a command is
/// invoked, a page is opened, a widget refreshes, etc).
interface PluginCapabilityBase {
  id: string;
  label: string;
  description?: string;
  hook: string;
}

export interface PluginCommandCapability extends PluginCapabilityBase {
  /// Optional keyboard shortcut hint (e.g. "mod+shift+p") — display-only,
  /// the platform's command palette owns actual key binding.
  shortcut?: string;
}

export interface PluginToolCapability extends PluginCapabilityBase {
  /// JSON-Schema-shaped, same spirit as an MCP tool's `inputSchema` —
  /// lets a future "install a plugin, its tools show up in MCP
  /// tools/list too" bridge exist without a manifest format change.
  inputSchema?: Record<string, unknown>;
}

export interface PluginResourceCapability extends PluginCapabilityBase {
  /// The URI *prefix* this plugin's resource lives under, e.g.
  /// `plugin://<slug>/widgets` — never a full `pentesthub://` URI
  /// (those stay MCP-server-owned).
  uriPrefix: string;
}

export interface PluginPromptCapability extends PluginCapabilityBase {
  variables?: string[];
}

export interface PluginWorkflowCapability extends PluginCapabilityBase {
  /// A ready-made `WorkflowDefinition` (see automation-engine.ts) this
  /// plugin offers as a one-click-install starting point — not itself
  /// executable until a user actually creates a `Workflow` from it.
  definition?: Record<string, unknown>;
}

export interface PluginPageCapability extends PluginCapabilityBase {
  /// Client-side route this page mounts at, e.g. `/plugins/<slug>/dashboard`.
  route: string;
}

export interface PluginWidgetCapability extends PluginCapabilityBase {
  size?: "small" | "medium" | "large";
}

export interface PluginSidebarItemCapability extends PluginCapabilityBase {
  icon?: string;
  route?: string;
}

export interface PluginDashboardWidgetCapability extends PluginCapabilityBase {
  size?: "small" | "medium" | "large";
  refreshIntervalSeconds?: number;
}

export interface PluginVersionDto {
  id: string;
  pluginId: string;
  version: string;
  manifest: PluginManifest;
  permissions: string[];
  dependencies: PluginDependencyDto[] | null;
  signaturePresent: boolean;
  signatureValid: boolean | null;
  changelog: string | null;
  deprecated: boolean;
  publishedAt: string;
}

export interface PluginDependencyDto {
  slug: string;
  versionRange: string;
}

export interface PublishPluginVersionRequestDto {
  version: string;
  manifest: PluginManifest;
  permissions: string[];
  dependencies?: PluginDependencyDto[];
  /// Base64 source bundle the signature was computed over — hashed
  /// (SHA-256) server-side and compared against `signature` using the
  /// author's registered Ed25519 public key. Optional: an unsigned version
  /// can still be published (useful for local/private development) but is
  /// never marketplace-listed as `verified`.
  sourceBundleBase64: string;
  signature?: string;
  changelog?: string;
}

export interface InstallPluginRequestDto {
  pluginId: string;
  versionId: string;
  workspaceId?: string;
  config?: Record<string, unknown>;
  /// Explicit, informed consent to the version's declared `permissions` —
  /// mirrors an OAuth consent screen. The install is rejected if this
  /// doesn't exactly match the version's permission list, so a client
  /// can't silently approve a stale/wrong permission set.
  acceptedPermissions: string[];
}

export interface PluginInstallationDto {
  id: string;
  organizationId: string | null;
  workspaceId: string | null;
  pluginId: string;
  versionId: string;
  installedBy: string;
  enabled: boolean;
  config: Record<string, unknown> | null;
  installedAt: string;
  updatedAt: string;
}

/// Module 14 — Auto Update. One row per installation whose installed
/// `versionId` is not the plugin's latest non-deprecated published
/// version — the "check for plugin updates" surface the Plugin
/// SDK/Marketplace (Module 13) never got a query for. Denormalizes
/// plugin name + both version strings so the Admin Console/frontend can
/// render a list without a second round-trip per row.
export interface PluginAvailableUpdateDto {
  installationId: string;
  pluginId: string;
  pluginName: string;
  workspaceId: string | null;
  installedVersionId: string;
  installedVersion: string;
  latestVersionId: string;
  latestVersion: string;
  latestChangelog: string | null;
}

export interface UpdatePluginInstallationRequestDto {
  versionId?: string;
  enabled?: boolean;
  config?: Record<string, unknown>;
  acceptedPermissions?: string[];
}

export interface RatePluginRequestDto {
  rating: number;
  review?: string;
}

export interface PluginRatingDto {
  id: string;
  pluginId: string;
  userId: string;
  rating: number;
  review: string | null;
  createdAt: string;
}

export interface ExecutePluginHookRequestDto {
  hook: string;
  input: Record<string, unknown>;
}

export interface ExecutePluginHookResultDto {
  output: unknown;
  logs: string[];
  durationMs: number;
}

export interface ListPluginsQueryDto {
  category?: PluginCategory;
  status?: PluginStatus;
  search?: string;
}

/// Module 13 — Plugin SDK (task #285). One entry per enabled
/// `PluginInstallation` in a workspace whose manifest declares
/// capabilities — the Developer Portal / a future plugin-aware
/// frontend renders pages/widgets/sidebar items from this list rather
/// than hard-coding which plugins exist.
export interface WorkspacePluginCapabilityDto {
  pluginId: string;
  pluginSlug: string;
  installationId: string;
  capabilities: PluginCapabilities;
}

/// Module 13 — Automation Marketplace (task #287). Same shape as
/// `ListPluginsQueryDto` but `category`, if given, must be one of
/// `PACK_CATEGORIES` — the handler always restricts results to pack
/// categories regardless, this just lets a caller narrow further (e.g.
/// "only WORKFLOW_PACK").
export interface ListMarketplacePacksQueryDto {
  category?: PluginCategory;
  search?: string;
}
