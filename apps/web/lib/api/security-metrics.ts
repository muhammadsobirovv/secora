import { SECURITY_METRICS_ENDPOINTS } from "@pentesthub/shared";
import type { SecurityMetricsSummaryDto, SecurityMetricsTrendPointDto } from "@pentesthub/shared";
import { apiFetch } from "./client";

// Module 17 — task #479 (Security Metrics). Workspace is resolved
// server-side from the caller's JWT, matching the platform-wide
// convention — no workspaceId param here.
export function getSecurityMetricsSummary(windowDays?: number) {
  const query = windowDays ? `?windowDays=${windowDays}` : "";
  return apiFetch<SecurityMetricsSummaryDto>(`${SECURITY_METRICS_ENDPOINTS.summary()}${query}`);
}

export function getSecurityMetricsTrend(weeks?: number) {
  const query = weeks ? `?weeks=${weeks}` : "";
  return apiFetch<SecurityMetricsTrendPointDto[]>(`${SECURITY_METRICS_ENDPOINTS.trend()}${query}`);
}
