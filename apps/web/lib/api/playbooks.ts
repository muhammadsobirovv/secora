import { PLAYBOOK_ENDPOINTS } from "@pentesthub/shared";
import type {
  CreatePlaybookRequestDto,
  DecidePlaybookApprovalRequestDto,
  PlaybookApprovalDto,
  PlaybookDryRunResultDto,
  PlaybookDto,
  PlaybookExecutionDto,
  PlaybookValidationResultDto,
  PlaybookVersionDto,
  StartPlaybookExecutionRequestDto,
  UpdatePlaybookDraftRequestDto,
} from "@pentesthub/shared";
import { apiFetch } from "./client";

// Module 16 — Playbooks + Playbook Builder (task #389). Workspace is
// resolved server-side from the caller's JWT, same convention as every
// other Module 16 API client. PLAYBOOK_ENDPOINTS paths don't carry a
// leading slash — added here, matching submissions.ts.

export function listPlaybooks(query: { status?: string; category?: string } = {}) {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.category) params.set("category", query.category);
  const qs = params.toString();
  return apiFetch<PlaybookDto[]>(`/${PLAYBOOK_ENDPOINTS.list()}${qs ? `?${qs}` : ""}`);
}

export function getPlaybook(id: string) {
  return apiFetch<{ playbook: PlaybookDto; version: PlaybookVersionDto | null }>(`/${PLAYBOOK_ENDPOINTS.playbook(id)}`);
}

export function createPlaybook(data: CreatePlaybookRequestDto) {
  return apiFetch<PlaybookDto>(`/${PLAYBOOK_ENDPOINTS.create()}`, { method: "POST", body: data });
}

export function updatePlaybookDraft(id: string, data: UpdatePlaybookDraftRequestDto) {
  return apiFetch<PlaybookDto>(`/${PLAYBOOK_ENDPOINTS.playbook(id)}`, { method: "POST", body: data });
}

export function publishPlaybook(id: string) {
  return apiFetch<PlaybookDto>(`/${PLAYBOOK_ENDPOINTS.publish(id)}`, { method: "POST" });
}

export function clonePlaybook(id: string) {
  return apiFetch<PlaybookDto>(`/${PLAYBOOK_ENDPOINTS.clone(id)}`, { method: "POST" });
}

export function archivePlaybook(id: string) {
  return apiFetch<PlaybookDto>(`/${PLAYBOOK_ENDPOINTS.archive(id)}`, { method: "POST" });
}

export function validatePlaybook(id: string) {
  return apiFetch<PlaybookValidationResultDto>(`/${PLAYBOOK_ENDPOINTS.validate(id)}`, { method: "POST" });
}

export function dryRunPlaybook(id: string, data: StartPlaybookExecutionRequestDto) {
  return apiFetch<PlaybookDryRunResultDto>(`/${PLAYBOOK_ENDPOINTS.dryRun(id)}`, { method: "POST", body: data });
}

export function runPlaybook(id: string, data: StartPlaybookExecutionRequestDto) {
  return apiFetch<PlaybookExecutionDto>(`/${PLAYBOOK_ENDPOINTS.run(id)}`, { method: "POST", body: data });
}

export function listPlaybookExecutions(id: string) {
  return apiFetch<PlaybookExecutionDto[]>(`/${PLAYBOOK_ENDPOINTS.executions(id)}`);
}

export function getPlaybookExecution(executionId: string) {
  return apiFetch<PlaybookExecutionDto>(`/${PLAYBOOK_ENDPOINTS.execution(executionId)}`);
}

export function listPlaybookApprovals() {
  return apiFetch<PlaybookApprovalDto[]>(`/${PLAYBOOK_ENDPOINTS.approvals()}`);
}

export function decidePlaybookApproval(id: string, data: DecidePlaybookApprovalRequestDto) {
  return apiFetch<PlaybookApprovalDto>(`/${PLAYBOOK_ENDPOINTS.decideApproval(id)}`, { method: "POST", body: data });
}
