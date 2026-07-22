// Module 10 — Enterprise Reporting: organization/workspace-wide rollup
// reports (distinct from Module 6/9's per-finding BugReport), plus
// recurring report schedules. See docs/adr/0010-enterprise-platform.md §8.

export type EnterpriseReportType =
  | "EXECUTIVE"
  | "TECHNICAL"
  | "COMPLIANCE"
  | "AUDIT"
  | "WEEKLY"
  | "MONTHLY"
  | "QUARTERLY"
  | "CUSTOM";

/// The rendered content of a generated report — real, computed
/// aggregates (not placeholder text), assembled by
/// `report-content-builder.service.ts` from live Prisma data at
/// generation time.
export interface EnterpriseReportContent {
  scope: { organizationId: string | null; workspaceId: string | null; workspaceCount: number };
  period: { start: string | null; end: string | null };
  findings: {
    totalOpen: number;
    bySeverity: Record<"INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL", number>;
    byStage: Record<string, number>;
    newInPeriod: number;
    resolvedInPeriod: number;
    averageResolutionHours: number | null;
  };
  bounties: { totalPaid: number; currency: string; paidCount: number };
  programs: { total: number; active: number };
  vulnScans: { totalFindingsBySeverity: Record<"INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL", number> };
  slaCompliance: { policiesEvaluated: number; withinTargetPct: number | null } | null;
  generatedAt: string;
}

export interface EnterpriseReportDto {
  id: string;
  organizationId: string | null;
  workspaceId: string | null;
  type: EnterpriseReportType;
  title: string;
  periodStart: string | null;
  periodEnd: string | null;
  content: EnterpriseReportContent;
  generatedBy: string | null;
  generatedByAi: boolean;
  createdAt: string;
}

export interface GenerateEnterpriseReportRequestDto {
  type: EnterpriseReportType;
  title: string;
  workspaceId?: string;
  periodStart?: string;
  periodEnd?: string;
}

export interface ReportScheduleDto {
  id: string;
  organizationId: string | null;
  workspaceId: string | null;
  type: EnterpriseReportType;
  cronExpression: string;
  recipients: string[];
  active: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateReportScheduleRequestDto {
  type: EnterpriseReportType;
  cronExpression: string;
  recipients: string[];
  workspaceId?: string;
}

export interface UpdateReportScheduleRequestDto {
  cronExpression?: string;
  recipients?: string[];
  active?: boolean;
}
