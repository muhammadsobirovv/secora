import type {
  FindingExplanationDto,
  ReportLanguage,
  ReportShareDto,
  ShareLinkDto,
  VulnReportDto,
} from "@pentesthub/shared";
import { apiFetch, apiFetchResponse } from "./client";

export function getVulnReport(jobId: string, language: ReportLanguage) {
  return apiFetch<VulnReportDto>(`/vuln/jobs/${jobId}/report?lang=${language}`);
}

export function explainFinding(jobId: string, findingId: string, language: ReportLanguage) {
  return apiFetch<FindingExplanationDto>(`/vuln/jobs/${jobId}/findings/${findingId}/explanation`, {
    method: "POST",
    body: { language },
  });
}

export type ReportExportFormat = "html" | "pdf" | "json";

/// Fetches an export with the user's token and returns it as a Blob, so it can
/// be opened or saved without putting the token in a URL.
export async function downloadReport(jobId: string, format: ReportExportFormat, language: ReportLanguage): Promise<Blob> {
  const res = await apiFetchResponse(`/vuln/jobs/${jobId}/report.${format}?lang=${language}`);
  return res.blob();
}

export function listReportShares(jobId: string, workspaceId?: string) {
  const query = workspaceId ? `?workspaceId=${workspaceId}` : "";
  return apiFetch<ShareLinkDto[]>(`/share-links${query}`).then((links) =>
    links.filter((link) => link.resourceType === "VULN_SCAN_REPORT" && link.resourceId === jobId),
  );
}

export function createReportShare(jobId: string, expiresInDays: number, password?: string) {
  return apiFetch<ShareLinkDto>("/share-links", {
    method: "POST",
    body: { resourceType: "VULN_SCAN_REPORT", resourceId: jobId, permission: "VIEW", expiresInDays, ...(password ? { password } : {}) },
  });
}

export function revokeReportShare(shareLinkId: string) {
  return apiFetch<void>(`/share-links/${shareLinkId}/revoke`, { method: "POST" });
}

/// The shared page: no login, the link token (and password) is the credential.
export function getSharedReport(token: string, language: ReportLanguage, password?: string) {
  return apiFetch<VulnReportDto>(`/share/${encodeURIComponent(token)}/report`, {
    method: "POST",
    public: true,
    body: { language, ...(password ? { password } : {}) },
  });
}

export type { ReportShareDto };
