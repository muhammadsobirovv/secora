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
  | "UTILITIES";

export type PluginStatus = "DRAFT" | "PUBLISHED" | "DEPRECATED" | "SUSPENDED";

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
