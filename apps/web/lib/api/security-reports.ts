import { SECURITY_REPORT_ENDPOINTS } from "@pentesthub/shared";
import type { GenerateSecurityReportRequestDto, SecurityReportDto } from "@pentesthub/shared";
import { apiFetch } from "./client";

/// Module 17 — task #481 (Security Reporting extensions / Report
/// Builder). Workspace resolved server-side from the caller's JWT,
/// matching the platform-wide convention.
export function listSecurityReports() {
  return apiFetch<SecurityReportDto[]>(SECURITY_REPORT_ENDPOINTS.list());
}

export function getSecurityReport(id: string) {
  return apiFetch<SecurityReportDto>(SECURITY_REPORT_ENDPOINTS.report(id));
}

export function generateSecurityReport(data: GenerateSecurityReportRequestDto) {
  return apiFetch<SecurityReportDto>(SECURITY_REPORT_ENDPOINTS.generate(), { method: "POST", body: data });
}
