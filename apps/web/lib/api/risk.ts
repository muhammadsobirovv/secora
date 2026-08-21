import { RISK_ENDPOINTS } from "@pentesthub/shared";
import type { AssetGraphNodeType, RiskFactorSnapshotDto } from "@pentesthub/shared";
import { apiFetch } from "./client";

// Module 17 — task #474/#475 (Risk Engine v2). Workspace is resolved
// server-side from the caller's JWT, matching the platform-wide
// convention — no workspaceId param here.
export function getLatestRiskForFinding(findingId: string) {
  return apiFetch<RiskFactorSnapshotDto | null>(RISK_ENDPOINTS.latestForFinding(findingId));
}

export function getRiskHistoryForFinding(findingId: string, limit?: number) {
  const query = limit ? `?limit=${limit}` : "";
  return apiFetch<RiskFactorSnapshotDto[]>(`${RISK_ENDPOINTS.historyForFinding(findingId)}${query}`);
}

export function getLatestRiskForAsset(nodeType: AssetGraphNodeType, refId: string) {
  return apiFetch<RiskFactorSnapshotDto | null>(RISK_ENDPOINTS.latestForAsset(nodeType, refId));
}

export function getRiskHistoryForAsset(nodeType: AssetGraphNodeType, refId: string, limit?: number) {
  const query = limit ? `?limit=${limit}` : "";
  return apiFetch<RiskFactorSnapshotDto[]>(`${RISK_ENDPOINTS.historyForAsset(nodeType, refId)}${query}`);
}
