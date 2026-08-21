"use client";

import { useQuery } from "@tanstack/react-query";
import * as incidentsApi from "@/lib/api/incidents";
import * as slaApi from "@/lib/api/sla";
import type { ListIncidentsParams } from "@/lib/api/incidents";
import type { ListSlaEventsParams } from "@/lib/api/sla";

/// Module 17 — task #480 (SOC dashboard + Executive Security dashboard).
/// Composes existing, already-shipped read surfaces (Incidents #470, SLA
/// #478, plus Remediation/Security Metrics/Indicators reused from #476
/// and #467) — no new backend aggregate endpoint, same posture the
/// Exposure Management dashboard's own hook documents.
export const socKeys = {
  all: ["soc"] as const,
  incidents: (params: ListIncidentsParams = {}) => ["soc", "incidents", params] as const,
  slaEvents: (params: ListSlaEventsParams = {}) => ["soc", "sla-events", params] as const,
  slaPolicies: ["soc", "sla-policies"] as const,
};

export function useIncidents(params: ListIncidentsParams = {}) {
  return useQuery({
    queryKey: socKeys.incidents(params),
    queryFn: () => incidentsApi.listIncidents(params),
  });
}

export function useSlaEvents(params: ListSlaEventsParams = {}) {
  return useQuery({
    queryKey: socKeys.slaEvents(params),
    queryFn: () => slaApi.listSlaEvents(params),
  });
}

export function useSlaPolicies() {
  return useQuery({
    queryKey: socKeys.slaPolicies,
    queryFn: () => slaApi.listSlaPolicies(),
  });
}
