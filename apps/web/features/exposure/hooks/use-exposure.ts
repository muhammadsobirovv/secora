"use client";

import { useQuery } from "@tanstack/react-query";
import * as remediationApi from "@/lib/api/remediation";
import * as securityMetricsApi from "@/lib/api/security-metrics";
import type { ListRemediationTasksParams } from "@/lib/api/remediation";

/// Module 17 — task #476 (Exposure Management dashboard). Composes three
/// existing, already-shipped read surfaces (Remediation tracking #477,
/// Security Metrics #479) into one screen — no new backend endpoint was
/// needed for this task, matching how `useVulnDashboardSummary` composes
/// existing Vuln reads rather than introducing a bespoke aggregate query.
export const exposureKeys = {
  all: ["exposure"] as const,
  remediationTasks: (params: ListRemediationTasksParams = {}) => ["exposure", "remediation-tasks", params] as const,
  metricsSummary: (windowDays?: number) => ["exposure", "metrics-summary", windowDays] as const,
  metricsTrend: (weeks?: number) => ["exposure", "metrics-trend", weeks] as const,
};

export function useOpenRemediationTasks(limit = 50) {
  const params: ListRemediationTasksParams = { limit };
  return useQuery({
    queryKey: exposureKeys.remediationTasks(params),
    queryFn: () => remediationApi.listRemediationTasks(params),
  });
}

export function useSecurityMetricsSummary(windowDays = 30) {
  return useQuery({
    queryKey: exposureKeys.metricsSummary(windowDays),
    queryFn: () => securityMetricsApi.getSecurityMetricsSummary(windowDays),
  });
}

export function useSecurityMetricsTrend(weeks = 8) {
  return useQuery({
    queryKey: exposureKeys.metricsTrend(weeks),
    queryFn: () => securityMetricsApi.getSecurityMetricsTrend(weeks),
  });
}
