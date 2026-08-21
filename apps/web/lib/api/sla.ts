import { SLA_ENDPOINTS } from "@pentesthub/shared";
import type { SlaEventDto, SlaPolicyDto, UpsertSlaPolicyRequestDto } from "@pentesthub/shared";
import { apiFetch } from "./client";

/// Module 17 — task #480 (SOC/Executive dashboards, the frontend half of
/// #478's SLA Engine — no SLA-policy management UI existed anywhere
/// before this task). Workspace resolved server-side from the caller's
/// JWT, matching every other Module 17 client file.
export function listSlaPolicies() {
  return apiFetch<SlaPolicyDto[]>(SLA_ENDPOINTS.policies());
}

export function upsertSlaPolicy(data: UpsertSlaPolicyRequestDto) {
  return apiFetch<SlaPolicyDto>(SLA_ENDPOINTS.upsertPolicy(), { method: "POST", body: data });
}

export interface ListSlaEventsParams {
  incidentId?: string;
  findingId?: string;
  breached?: boolean;
}

export function listSlaEvents(params: ListSlaEventsParams = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value));
  }
  const qs = query.toString();
  return apiFetch<SlaEventDto[]>(`${SLA_ENDPOINTS.events()}${qs ? `?${qs}` : ""}`);
}
