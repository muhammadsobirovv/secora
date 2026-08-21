import { REMEDIATION_ENDPOINTS } from "@pentesthub/shared";
import type {
  CreateRemediationTaskRequestDto,
  FindingVerificationDto,
  RemediationEvidenceLinkDto,
  RemediationTaskDto,
  UpdateFindingVerificationRequestDto,
  UpdateRemediationTaskRequestDto,
  UpdateRemediationTaskStatusRequestDto,
} from "@pentesthub/shared";
import { apiFetch } from "./client";

// Module 17 — task #477 (Remediation tracking & verification). Workspace
// is resolved server-side from the caller's JWT, matching the
// platform-wide convention — no workspaceId param here.
export interface ListRemediationTasksParams {
  status?: string;
  priority?: string;
  projectId?: string;
  incidentId?: string;
  findingId?: string;
  limit?: number;
}

export function listRemediationTasks(params: ListRemediationTasksParams = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value));
  }
  const qs = query.toString();
  return apiFetch<RemediationTaskDto[]>(`${REMEDIATION_ENDPOINTS.list()}${qs ? `?${qs}` : ""}`);
}

export function createRemediationTask(data: CreateRemediationTaskRequestDto) {
  return apiFetch<RemediationTaskDto>(REMEDIATION_ENDPOINTS.create(), { method: "POST", body: data });
}

export function getRemediationTask(id: string) {
  return apiFetch<RemediationTaskDto>(REMEDIATION_ENDPOINTS.task(id));
}

export function updateRemediationTask(id: string, data: UpdateRemediationTaskRequestDto) {
  return apiFetch<RemediationTaskDto>(REMEDIATION_ENDPOINTS.task(id), { method: "PATCH", body: data });
}

export function setRemediationTaskStatus(id: string, data: UpdateRemediationTaskStatusRequestDto) {
  return apiFetch<RemediationTaskDto>(REMEDIATION_ENDPOINTS.setStatus(id), { method: "PATCH", body: data });
}

export function linkRemediationEvidence(id: string, evidenceId: string) {
  return apiFetch<RemediationEvidenceLinkDto>(REMEDIATION_ENDPOINTS.evidence(id), {
    method: "POST",
    body: { evidenceId },
  });
}

export function listRemediationEvidence(id: string) {
  return apiFetch<RemediationEvidenceLinkDto[]>(REMEDIATION_ENDPOINTS.evidence(id));
}

export function getFindingVerification(findingId: string) {
  return apiFetch<FindingVerificationDto>(REMEDIATION_ENDPOINTS.findingVerification(findingId));
}

export function setFindingVerification(findingId: string, data: UpdateFindingVerificationRequestDto) {
  return apiFetch<FindingVerificationDto>(REMEDIATION_ENDPOINTS.findingVerification(findingId), {
    method: "PATCH",
    body: data,
  });
}
