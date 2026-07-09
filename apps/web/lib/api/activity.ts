import { ACTIVITY_ENDPOINTS } from "@pentesthub/shared";
import type { ActivityEventDto, ListActivityQueryDto } from "@pentesthub/shared";
import { apiFetch } from "./client";

export function listActivity(filter: ListActivityQueryDto = {}) {
  const params = new URLSearchParams();
  if (filter.projectId) params.set("projectId", filter.projectId);
  if (filter.cursor) params.set("cursor", filter.cursor);
  if (filter.limit) params.set("limit", String(filter.limit));
  const qs = params.toString();
  return apiFetch<ActivityEventDto[]>(`${ACTIVITY_ENDPOINTS.list}${qs ? `?${qs}` : ""}`);
}
