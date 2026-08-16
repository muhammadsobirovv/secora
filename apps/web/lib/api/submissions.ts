import { SUBMISSION_ENDPOINTS } from "@pentesthub/shared";
import type {
  CreateSubmissionRequestDto,
  SubmissionAnalyticsDto,
  SubmissionDto,
  UpdateSubmissionStatusRequestDto,
} from "@pentesthub/shared";
import { apiFetch } from "./client";

// Module 16 — Bug Bounty Submissions + Rewards (task #385). Workspace is
// resolved server-side from the caller's JWT — no workspaceId param here,
// matching the platform-wide convention. SUBMISSION_ENDPOINTS paths don't
// carry a leading slash (see module16-endpoints.ts), so it's added here.

export function listSubmissions(query: { programId?: string; findingId?: string; status?: string } = {}) {
  const params = new URLSearchParams();
  if (query.programId) params.set("programId", query.programId);
  if (query.findingId) params.set("findingId", query.findingId);
  if (query.status) params.set("status", query.status);
  const qs = params.toString();
  return apiFetch<SubmissionDto[]>(`/${SUBMISSION_ENDPOINTS.list()}${qs ? `?${qs}` : ""}`);
}

export function getSubmission(id: string) {
  return apiFetch<SubmissionDto>(`/${SUBMISSION_ENDPOINTS.submission(id)}`);
}

export function createSubmission(data: CreateSubmissionRequestDto) {
  return apiFetch<SubmissionDto>(`/${SUBMISSION_ENDPOINTS.create()}`, {
    method: "POST",
    body: data,
  });
}

export function updateSubmissionStatus(id: string, data: UpdateSubmissionStatusRequestDto) {
  return apiFetch<SubmissionDto>(`/${SUBMISSION_ENDPOINTS.submission(id)}/status`, {
    method: "PATCH",
    body: data,
  });
}

export function getRewardAnalytics() {
  return apiFetch<SubmissionAnalyticsDto>(`/${SUBMISSION_ENDPOINTS.rewards()}`);
}
