import {
  VULN_DASHBOARD_ENDPOINTS,
  VULN_FINDING_ENDPOINTS,
  VULN_SCAN_JOB_ENDPOINTS,
  VULN_SCAN_TEMPLATE_ENDPOINTS,
} from "@pentesthub/shared";
import type {
  BulkUpdateVulnFindingsRequestDto,
  CreateVulnScanJobRequestDto,
  CreateVulnScanTemplateRequestDto,
  ListVulnFindingsQueryDto,
  ListVulnScanJobsQueryDto,
  UpdateVulnFindingStatusRequestDto,
  VulnDashboardSummaryDto,
  VulnFindingDto,
  VulnScanJobDto,
  VulnScannerHistoryEntryDto,
  VulnScanTemplateDto,
} from "@pentesthub/shared";
import { apiFetch } from "./client";

function toQueryString(query: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function listVulnScanJobsForTarget(targetId: string) {
  return apiFetch<VulnScanJobDto[]>(VULN_SCAN_JOB_ENDPOINTS.listForTarget(targetId));
}

export function listVulnScanJobsForProject(projectId: string) {
  return apiFetch<VulnScanJobDto[]>(VULN_SCAN_JOB_ENDPOINTS.listForProject(projectId));
}

export function listRecentVulnScanJobs(query: ListVulnScanJobsQueryDto = {}) {
  return apiFetch<VulnScanJobDto[]>(
    `${VULN_SCAN_JOB_ENDPOINTS.listRecent}${toQueryString(query as Record<string, string | number | undefined>)}`,
  );
}

export function getVulnScanJob(id: string) {
  return apiFetch<VulnScanJobDto>(VULN_SCAN_JOB_ENDPOINTS.get(id));
}

export function createVulnScanJob(targetId: string, data: CreateVulnScanJobRequestDto) {
  return apiFetch<VulnScanJobDto>(VULN_SCAN_JOB_ENDPOINTS.createForTarget(targetId), {
    method: "POST",
    body: data,
  });
}

export function stopVulnScanJob(id: string) {
  return apiFetch<VulnScanJobDto>(VULN_SCAN_JOB_ENDPOINTS.stop(id), { method: "POST" });
}

export function pauseVulnScanJob(id: string) {
  return apiFetch<VulnScanJobDto>(VULN_SCAN_JOB_ENDPOINTS.pause(id), { method: "POST" });
}

export function resumeVulnScanJob(id: string) {
  return apiFetch<VulnScanJobDto>(VULN_SCAN_JOB_ENDPOINTS.resume(id), { method: "POST" });
}

export function retryVulnScanJob(id: string) {
  return apiFetch<VulnScanJobDto>(VULN_SCAN_JOB_ENDPOINTS.retry(id), { method: "POST" });
}

export function listVulnScanJobFindings(jobId: string) {
  return apiFetch<VulnFindingDto[]>(VULN_SCAN_JOB_ENDPOINTS.findings(jobId));
}

export function listVulnFindings(query: ListVulnFindingsQueryDto = {}) {
  return apiFetch<VulnFindingDto[]>(
    `${VULN_FINDING_ENDPOINTS.list}${toQueryString(query as Record<string, string | number | undefined>)}`,
  );
}

export function listVulnFindingsForTarget(targetId: string) {
  return apiFetch<VulnFindingDto[]>(VULN_FINDING_ENDPOINTS.listForTarget(targetId));
}

export function getVulnFinding(id: string) {
  return apiFetch<VulnFindingDto>(VULN_FINDING_ENDPOINTS.get(id));
}

export function updateVulnFindingStatus(id: string, data: UpdateVulnFindingStatusRequestDto) {
  return apiFetch<VulnFindingDto>(VULN_FINDING_ENDPOINTS.updateStatus(id), {
    method: "PATCH",
    body: data,
  });
}

export function bulkUpdateVulnFindings(data: BulkUpdateVulnFindingsRequestDto) {
  return apiFetch<VulnFindingDto[]>(VULN_FINDING_ENDPOINTS.bulkUpdateStatus, {
    method: "POST",
    body: data,
  });
}

export function listVulnScanTemplates() {
  return apiFetch<VulnScanTemplateDto[]>(VULN_SCAN_TEMPLATE_ENDPOINTS.list);
}

export function createVulnScanTemplate(data: CreateVulnScanTemplateRequestDto) {
  return apiFetch<VulnScanTemplateDto>(VULN_SCAN_TEMPLATE_ENDPOINTS.create, {
    method: "POST",
    body: data,
  });
}

export function deleteVulnScanTemplate(id: string) {
  return apiFetch<void>(VULN_SCAN_TEMPLATE_ENDPOINTS.delete(id), { method: "DELETE" });
}

export function getVulnDashboardSummary() {
  return apiFetch<VulnDashboardSummaryDto>(VULN_DASHBOARD_ENDPOINTS.summary);
}

export function listVulnScannerHistory() {
  return apiFetch<VulnScannerHistoryEntryDto[]>(VULN_DASHBOARD_ENDPOINTS.scannerHistory);
}
