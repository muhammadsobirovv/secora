import type {
  IncidentSeverity,
  IncidentStatus,
  IndicatorType,
  RemediationPriority,
  SecurityMetricsSummaryDto,
} from "./soc-threat-intel.js";

/// Module 17 — task #481 (Security Reporting extensions / Report
/// Builder). See the Prisma schema's own doc comment on `SecurityReport`
/// for why this is a new, workspace-scoped model rather than an
/// extension of `BugReport` (structurally bug-bounty-only) or
/// `EnterpriseReport` (Organization-scoped, Enterprise-only). Content is
/// a computed JSON snapshot built by composing existing services — no
/// duplicated aggregation logic and no new rendering pipeline (matches
/// `EnterpriseReport`'s own "JSON blob, no PDF/HTML export" precedent).
export type SecurityReportType = "INCIDENT_SUMMARY" | "THREAT_INTEL_SUMMARY" | "POSTURE_SUMMARY";

export interface SecurityReportIncidentEntryDto {
  id: string;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  createdAt: string;
}

export interface SecurityReportIncidentSummaryContentDto {
  totalIncidents: number;
  openIncidents: number;
  bySeverity: Record<IncidentSeverity, number>;
  byStatus: Record<IncidentStatus, number>;
  slaBreaches: number;
  incidents: SecurityReportIncidentEntryDto[];
}

export interface SecurityReportIndicatorEntryDto {
  id: string;
  type: IndicatorType;
  value: string;
  confidence: number;
  source: string;
  lastSeenAt: string;
}

export interface SecurityReportThreatIntelSummaryContentDto {
  totalIndicators: number;
  activeIndicators: number;
  byType: Partial<Record<IndicatorType, number>>;
  recentIndicators: SecurityReportIndicatorEntryDto[];
}

export interface SecurityReportPostureSummaryContentDto {
  metrics: SecurityMetricsSummaryDto;
  openRemediationTasks: number;
  overdueRemediationTasks: number;
  remediationByPriority: Record<RemediationPriority, number>;
  incidentsBySeverity: Record<IncidentSeverity, number>;
}

export type SecurityReportContent =
  | SecurityReportIncidentSummaryContentDto
  | SecurityReportThreatIntelSummaryContentDto
  | SecurityReportPostureSummaryContentDto;

export interface SecurityReportDto {
  id: string;
  workspaceId: string;
  type: SecurityReportType;
  title: string;
  periodStart: string | null;
  periodEnd: string | null;
  content: SecurityReportContent;
  generatedBy: string | null;
  generatedByAi: boolean;
  createdAt: string;
}

export interface GenerateSecurityReportRequestDto {
  type: SecurityReportType;
  title?: string;
  /// Window (days back from now) used to scope incident/indicator
  /// content — not persisted as literal `periodStart`/`periodEnd`
  /// filters on every sub-query (some, like "current open remediation
  /// backlog", are inherently point-in-time), but does set the report's
  /// own `periodStart`/`periodEnd` metadata fields.
  windowDays?: number;
}
