import { FEATURE_FLAGS_ENDPOINTS } from "@pentesthub/shared";
import type { EvaluatedFeatureFlagsDto } from "@pentesthub/shared";
import { apiFetch } from "./client";

// Module 15 — task #357. Authenticated only — `evaluate()` always
// resolves to the calling user's own flag values (see
// FeatureFlagsService.evaluateAll's doc comment for why
// workspaceId/organizationId are optional query params rather than
// implicitly resolved).
export function getEvaluatedFeatureFlags(params?: { workspaceId?: string; organizationId?: string }) {
  const query = new URLSearchParams();
  if (params?.workspaceId) query.set("workspaceId", params.workspaceId);
  if (params?.organizationId) query.set("organizationId", params.organizationId);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiFetch<EvaluatedFeatureFlagsDto>(`${FEATURE_FLAGS_ENDPOINTS.evaluate()}${suffix}`);
}
