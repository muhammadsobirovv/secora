import { RECON_FINDING_ENDPOINTS, RECON_JOB_ENDPOINTS } from "@pentesthub/shared";
import type {
  CreateReconJobRequestDto,
  PromoteFindingRequestDto,
  ReconFindingDto,
  ReconJobDto,
} from "@pentesthub/shared";
import { apiFetch } from "./client";

export function listReconJobsForTarget(targetId: string) {
  return apiFetch<ReconJobDto[]>(RECON_JOB_ENDPOINTS.listForTarget(targetId));
}

export function listReconJobsForProject(projectId: string) {
  return apiFetch<ReconJobDto[]>(RECON_JOB_ENDPOINTS.listForProject(projectId));
}

export function listRecentReconJobs() {
  return apiFetch<ReconJobDto[]>(RECON_JOB_ENDPOINTS.listRecent);
}

export function getReconJob(id: string) {
  return apiFetch<ReconJobDto>(RECON_JOB_ENDPOINTS.get(id));
}

export function createReconJob(targetId: string, data: CreateReconJobRequestDto) {
  return apiFetch<ReconJobDto>(RECON_JOB_ENDPOINTS.createForTarget(targetId), {
    method: "POST",
    body: data,
  });
}

export function cancelReconJob(id: string) {
  return apiFetch<ReconJobDto>(RECON_JOB_ENDPOINTS.cancel(id), { method: "POST" });
}

export function retryReconJob(id: string) {
  return apiFetch<ReconJobDto>(RECON_JOB_ENDPOINTS.retry(id), { method: "POST" });
}

export function listReconJobFindings(jobId: string) {
  return apiFetch<ReconFindingDto[]>(RECON_JOB_ENDPOINTS.findings(jobId));
}

export function listReconFindingsForTarget(targetId: string) {
  return apiFetch<ReconFindingDto[]>(RECON_FINDING_ENDPOINTS.listForTarget(targetId));
}

export function getReconFinding(id: string) {
  return apiFetch<ReconFindingDto>(RECON_FINDING_ENDPOINTS.get(id));
}

export function promoteReconFinding(id: string, data: PromoteFindingRequestDto = {}) {
  return apiFetch(RECON_FINDING_ENDPOINTS.promote(id), { method: "POST", body: data });
}
