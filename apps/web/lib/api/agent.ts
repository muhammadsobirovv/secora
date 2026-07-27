import type {
  CreateOrchestrationRunRequestDto,
  ListOrchestrationRunsQueryDto,
  OrchestrationExplanationDto,
  OrchestrationRunDto,
  OrchestrationRunSummaryDto,
} from "@pentesthub/shared";
import { AGENT_ORCHESTRATION_ENDPOINTS } from "@pentesthub/shared";
import { apiFetch } from "./client";

/// Module 11 — Frontend Copilot/Agent UI (task #237). Mirrors the
/// one-function-per-endpoint style established by lib/api/ai.ts and
/// lib/api/recon.ts. The stream endpoint has no wrapper here — it's read
/// manually via fetch()'s ReadableStream in
/// features/agent/hooks/use-agent.ts, same as useReconJobLogs.
export function listOrchestrationRuns(query: ListOrchestrationRunsQueryDto = {}) {
  const params = new URLSearchParams();
  if (query.projectId) params.set("projectId", query.projectId);
  if (query.status) params.set("status", query.status);
  if (query.limit) params.set("limit", String(query.limit));
  const qs = params.toString();
  return apiFetch<OrchestrationRunSummaryDto[]>(
    `${AGENT_ORCHESTRATION_ENDPOINTS.list}${qs ? `?${qs}` : ""}`,
  );
}

export function createOrchestrationRun(body: CreateOrchestrationRunRequestDto) {
  return apiFetch<OrchestrationRunDto>(AGENT_ORCHESTRATION_ENDPOINTS.create, { method: "POST", body });
}

export function getOrchestrationRun(id: string) {
  return apiFetch<OrchestrationRunDto>(AGENT_ORCHESTRATION_ENDPOINTS.get(id));
}

export function cancelOrchestrationRun(id: string) {
  return apiFetch<OrchestrationRunDto>(AGENT_ORCHESTRATION_ENDPOINTS.cancel(id), { method: "POST" });
}

export function retryOrchestrationRun(id: string) {
  return apiFetch<OrchestrationRunDto>(AGENT_ORCHESTRATION_ENDPOINTS.retry(id), { method: "POST" });
}

export function explainOrchestrationRun(id: string) {
  return apiFetch<OrchestrationExplanationDto>(AGENT_ORCHESTRATION_ENDPOINTS.explain(id));
}
