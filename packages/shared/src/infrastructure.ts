// Module 14 — Cloud Platform, Enterprise SaaS, High Availability & Global
// Infrastructure. Types for the Edition system, Licensing, and the Admin
// Console's infrastructure dashboard. See
// docs/adr/0014-cloud-platform-enterprise-saas-ha.md.

/// `community` (default on every fresh install — see `PENTESTHUB_EDITION`
/// in env.validation.ts) unlocks nothing extra; `enterprise` unlocks the
/// *code paths* Tenant Management/billing/branding/custom domains sit
/// behind. A deployment can set `PENTESTHUB_EDITION=enterprise` with no
/// `License` row at all (self-managed/trusted environments) — `License`
/// is an optional additional gate for hosted multi-tenant deployments
/// that want to enforce per-organization entitlement, not a requirement
/// for Enterprise code paths to exist at all.
export type Edition = "community" | "enterprise";

/// Module 14 — Auto Update. `HealthController.liveness()`'s response
/// shape — kept here rather than only inline in the controller so
/// `apps/web`'s stale-build banner hook has a shared type to import.
export interface LivenessDto {
  status: "ok";
  uptimeSeconds: number;
  version: string;
}

/// Module 15 — task #353 (Health & diagnostics). A public, richer
/// sibling to `LivenessDto`/readiness: bundles a real database
/// round-trip (with its own latency, not just ok/failed) alongside
/// process metadata, so `apps/web`'s Settings → Diagnostics page and any
/// future support-ticket flow (task #355) can build a self-contained
/// "here's what my client sees" report from a single request instead of
/// stitching together liveness + readiness + client-side timing by hand.
/// Deliberately `@Public()` on the API side — a user who can't log in is
/// exactly the person who most needs this to work.
export interface HealthDiagnosticsDto {
  status: "ok" | "degraded";
  serverTime: string;
  uptimeSeconds: number;
  version: string;
  nodeEnv: string;
  checks: {
    database: { status: "ok" | "failed"; latencyMs: number | null };
  };
}

export interface EditionInfoDto {
  edition: Edition;
  /// True when `edition === 'enterprise'` AND (no `License` rows exist,
  /// i.e. the operator trusts env-level gating alone) OR at least one
  /// `License` row is ACTIVE and unexpired for the organization in
  /// question. See `EditionService.isEnterpriseFor()`.
  enterpriseFeaturesEnabled: boolean;
  activeLicense: LicenseDto | null;
}

export type LicenseEdition = "COMMUNITY" | "ENTERPRISE";
export type LicenseStatus = "ACTIVE" | "EXPIRED" | "REVOKED";

export interface LicenseDto {
  id: string;
  organizationId: string | null;
  edition: LicenseEdition;
  issuedTo: string;
  seats: number | null;
  status: LicenseStatus;
  activatedAt: string;
  expiresAt: string | null;
}

export interface ActivateLicenseRequestDto {
  /// The raw license key, e.g. `PHUB-ENT-XXXX-XXXX-XXXX-XXXX`. Only its
  /// SHA-256 hash is ever persisted (`License.licenseKeyHash`) — the
  /// server never stores the plaintext key it was activated with.
  licenseKey: string;
  organizationId?: string;
}

// ---------------------------------------------------------------------------
// Admin Console — infrastructure dashboard
// ---------------------------------------------------------------------------

export type ProviderKind = "memory" | "redis" | "disk" | "local" | "s3";

export interface QueueDashboardDto {
  provider: ProviderKind;
  connected: boolean;
  /// Depth per named queue (job name / topic), not per priority — see
  /// `QueueService.stats()`.
  queues: { name: string; pending: number; delayed: number; deadLettered: number }[];
}

export interface CacheDashboardDto {
  provider: ProviderKind;
  connected: boolean;
  entryCount: number | null;
  hitRate: number | null;
}

export interface StorageDashboardDto {
  provider: ProviderKind;
  bucket: string | null;
  /// Only populated when the provider can cheaply report it — `local`
  /// reports disk usage under its root; `s3` reports `null` (a full
  /// bucket-usage scan isn't cheap enough to do on every dashboard load).
  totalBytes: number | null;
}

export interface DatabaseDashboardDto {
  provider: "postgresql";
  poolMax: number;
  readReplicaConfigured: boolean;
  migrationsApplied: number;
}

/// One row per named lease in the `poller_leases` table (Module 10's
/// PollerLeaseService, generalized by Module 14 into the platform's
/// leader-election primitive — see that service's `listLeases()`).
/// `holderId` is the winning replica's random per-process instance ID,
/// not anything a human assigned — useful for confirming leases are
/// actually rotating across replicas (a `holderId` that never changes
/// across repeated polls of this endpoint, on a multi-replica
/// deployment, would indicate every tick keeps landing on the same
/// pod rather than being redistributed on failover).
export interface ClusterLeaseDto {
  name: string;
  holderId: string;
  acquiredAt: string;
  expiresAt: string;
  expired: boolean;
}

export interface ClusterOverviewDto {
  edition: Edition;
  instanceId: string;
  /// Currently-running application version only — no update-check or
  /// rollback data. That expands once the Auto Update task lands; kept
  /// here now rather than adding a second dashboard call later.
  version: { current: string };
  workerNodes: { total: number; online: number; unhealthy: number };
  distributedJobs: { queued: number; running: number; failed24h: number };
  queue: QueueDashboardDto;
  cache: CacheDashboardDto;
  storage: StorageDashboardDto;
  database: DatabaseDashboardDto;
  backups: { lastRunAt: string | null; lastRunStatus: string | null; policiesConfigured: number };
  /// `PluginInstallation` rows across every organization (Admin Console
  /// "Plugins" summary) — the full per-plugin marketplace listing lives
  /// under the `plugins` module's own endpoints, not here.
  plugins: { installed: number; enabled: number };
  /// Same value `EditionController`'s `GET /infrastructure/edition`
  /// returns, deployment-wide (no `organizationId`) — included here so
  /// the Admin Console overview doesn't need a second round-trip just to
  /// show the "Licensing" tile.
  activeLicense: LicenseDto | null;
  health: { live: boolean; ready: boolean };
  leases: ClusterLeaseDto[];
}
