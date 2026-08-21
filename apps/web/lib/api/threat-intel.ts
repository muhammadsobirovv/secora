import { THREAT_INTEL_ENDPOINTS } from "@pentesthub/shared";
import type {
  CreateIndicatorRequestDto,
  IndicatorDto,
  IndicatorStatus,
  IndicatorType,
  UpdateIndicatorStatusRequestDto,
} from "@pentesthub/shared";
import { apiFetch } from "./client";

/// Module 17 — task #467 (Indicator management, frontend half — the API
/// half shipped as part of #466). Workspace is resolved server-side from
/// the caller's JWT (`ThreatIntelController.resolveWorkspaceId`), so
/// there's no workspaceId param here, matching every other Module 17
/// client file.
export interface ListIndicatorsParams {
  type?: IndicatorType;
  status?: IndicatorStatus;
  search?: string;
  limit?: number;
}

export function listIndicators(params: ListIndicatorsParams = {}) {
  const query = new URLSearchParams();
  if (params.type) query.set("type", params.type);
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);
  if (params.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return apiFetch<IndicatorDto[]>(`${THREAT_INTEL_ENDPOINTS.indicators()}${qs ? `?${qs}` : ""}`);
}

export function getIndicator(id: string) {
  return apiFetch<IndicatorDto>(THREAT_INTEL_ENDPOINTS.indicator(id));
}

export function createIndicator(data: CreateIndicatorRequestDto) {
  return apiFetch<IndicatorDto>(THREAT_INTEL_ENDPOINTS.indicators(), { method: "POST", body: data });
}

export function setIndicatorStatus(id: string, data: UpdateIndicatorStatusRequestDto) {
  return apiFetch<IndicatorDto>(THREAT_INTEL_ENDPOINTS.setIndicatorStatus(id), { method: "PATCH", body: data });
}
