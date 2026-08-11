export const EDITION_ENDPOINTS = {
  info: () => "/infrastructure/edition",
  activateLicense: () => "/infrastructure/license/activate",
  revokeLicense: (id: string) => `/infrastructure/license/${id}`,
} as const;

export const ADMIN_INFRASTRUCTURE_ENDPOINTS = {
  clusterOverview: () => "/infrastructure/admin/cluster-overview",
} as const;

/// Module 14 — Auto Update. `liveness` is the one endpoint `apps/web`'s
/// stale-build banner polls unauthenticated to compare the server's
/// running version against `NEXT_PUBLIC_APP_VERSION` baked into the JS
/// bundle at build time. See `HealthController` (Module 10 Observability)
/// — deliberately reusing the existing liveness probe rather than adding
/// a parallel `/version` endpoint.
export const OBSERVABILITY_HEALTH_ENDPOINTS = {
  liveness: () => "/observability/health",
  readiness: () => "/observability/health/ready",
} as const;
