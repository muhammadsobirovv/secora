import {
  ADMIN_INFRASTRUCTURE_ENDPOINTS,
  EDITION_ENDPOINTS,
  OBSERVABILITY_HEALTH_ENDPOINTS,
} from "@pentesthub/shared";
import type {
  ActivateLicenseRequestDto,
  ClusterOverviewDto,
  EditionInfoDto,
  HealthDiagnosticsDto,
  LicenseDto,
  LivenessDto,
} from "@pentesthub/shared";
import { apiFetch } from "./client";

export function getClusterOverview() {
  return apiFetch<ClusterOverviewDto>(ADMIN_INFRASTRUCTURE_ENDPOINTS.clusterOverview());
}

export function getEditionInfo() {
  return apiFetch<EditionInfoDto>(EDITION_ENDPOINTS.info());
}

export function activateLicense(data: ActivateLicenseRequestDto) {
  return apiFetch<LicenseDto>(EDITION_ENDPOINTS.activateLicense(), { method: "POST", body: data });
}

export function revokeLicense(id: string) {
  return apiFetch<LicenseDto>(EDITION_ENDPOINTS.revokeLicense(id), { method: "DELETE" });
}

// Module 14 — Auto Update: `public: true` since this needs to work for
// logged-out visitors too (the stale-build banner isn't auth-gated).
export function getLiveness() {
  return apiFetch<LivenessDto>(OBSERVABILITY_HEALTH_ENDPOINTS.liveness(), { public: true });
}

// Module 15 — task #353 (Health & diagnostics). Same `public: true`
// reasoning as `getLiveness()` — a signed-out visitor troubleshooting a
// login problem is exactly who needs this to work without a token.
export function getHealthDiagnostics() {
  return apiFetch<HealthDiagnosticsDto>(OBSERVABILITY_HEALTH_ENDPOINTS.diagnostics(), { public: true });
}
