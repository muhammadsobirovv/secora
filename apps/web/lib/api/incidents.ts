import { INCIDENT_ENDPOINTS } from "@pentesthub/shared";
import type { CreateIncidentRequestDto, IncidentDto, IncidentSeverity, IncidentStatus, IncidentTimelineEventDto } from "@pentesthub/shared";
import { apiFetch } from "./client";

/// Module 17 — task #480 (SOC/Executive dashboards). Workspace is
/// resolved server-side from the caller's JWT, matching the platform-wide
/// convention. This client covers only what the dashboards need
/// (list/get/timeline read paths + create) — full incident triage
/// workflow UI (status transitions, assignment, notes) is out of scope
/// for #480 and left for a future dedicated incidents page.
export interface ListIncidentsParams {
  status?: IncidentStatus;
  severity?: IncidentSeverity;
  projectId?: string;
  limit?: number;
}

export function listIncidents(params: ListIncidentsParams = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value));
  }
  const qs = query.toString();
  return apiFetch<IncidentDto[]>(`${INCIDENT_ENDPOINTS.list()}${qs ? `?${qs}` : ""}`);
}

export function createIncident(data: CreateIncidentRequestDto) {
  return apiFetch<IncidentDto>(INCIDENT_ENDPOINTS.create(), { method: "POST", body: data });
}

export function getIncident(id: string) {
  return apiFetch<IncidentDto>(INCIDENT_ENDPOINTS.incident(id));
}

export function getIncidentTimeline(id: string) {
  return apiFetch<IncidentTimelineEventDto[]>(INCIDENT_ENDPOINTS.timeline(id));
}
