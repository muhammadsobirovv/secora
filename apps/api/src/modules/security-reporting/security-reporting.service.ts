import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  GenerateSecurityReportRequestDto,
  IncidentDto,
  IncidentSeverity,
  IncidentStatus,
  IndicatorDto,
  IndicatorType,
  RemediationPriority,
  RemediationTaskDto,
  SecurityReportContent,
  SecurityReportDto,
  SecurityReportIncidentSummaryContentDto,
  SecurityReportPostureSummaryContentDto,
  SecurityReportThreatIntelSummaryContentDto,
  SecurityReportType,
} from '@pentesthub/shared';
import { AppException } from '../../common/exceptions/app.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { IncidentsService } from '../incidents/incidents.service.js';
import { SlaService } from '../sla/sla.service.js';
import { RemediationService } from '../remediation/remediation.service.js';
import { IndicatorsService } from '../threat-intel/indicators.service.js';
import { SecurityMetricsService } from '../security-metrics/security-metrics.service.js';

const OPEN_LIKE_REMEDIATION_STATUSES = new Set(['OPEN', 'IN_PROGRESS', 'BLOCKED', 'READY_FOR_VERIFICATION']);
const OPEN_LIKE_INCIDENT_STATUSES = new Set<IncidentStatus>([
  'OPEN',
  'INVESTIGATING',
  'CONTAINMENT',
  'ERADICATION',
  'RECOVERY',
  'REOPENED',
]);

interface SecurityReportRow {
  id: string;
  workspaceId: string;
  type: SecurityReportType;
  title: string;
  periodStart: Date | string | null;
  periodEnd: Date | string | null;
  contentJson: unknown;
  generatedBy: string | null;
  generatedByAi: boolean;
  createdAt: Date | string;
}

function toDto(row: SecurityReportRow): SecurityReportDto {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    type: row.type,
    title: row.title,
    periodStart: row.periodStart ? new Date(row.periodStart).toISOString() : null,
    periodEnd: row.periodEnd ? new Date(row.periodEnd).toISOString() : null,
    content: row.contentJson as SecurityReportContent,
    generatedBy: row.generatedBy,
    generatedByAi: row.generatedByAi,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

/// Module 17 — task #481 (Security Reporting extensions / Report
/// Builder). Pure composition service — every figure in a generated
/// report comes from calling an *existing*, already-security-reviewed
/// service's own workspace-scoped read method (never a raw Prisma query
/// against another module's tables), matching the "reuse existing report
/// infrastructure" / "extend, don't rewrite" constraints applied at the
/// service-composition level. See the Prisma schema's own doc comment on
/// `SecurityReport` for why this is a new model rather than extending
/// `BugReport` or `EnterpriseReport`.
///
/// A generated report is a point-in-time JSON snapshot, not a live view —
/// intentionally, so a report referenced later (e.g. attached to an
/// incident postmortem) doesn't silently change out from under the
/// reader. Re-generate to get fresh figures.
@Injectable()
export class SecurityReportingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly incidents: IncidentsService,
    private readonly sla: SlaService,
    private readonly remediation: RemediationService,
    private readonly indicators: IndicatorsService,
    private readonly securityMetrics: SecurityMetricsService,
  ) {}

  async listForWorkspace(workspaceId: string): Promise<SecurityReportDto[]> {
    const rows = await (
      this.prisma as unknown as {
        securityReport: { findMany: (args: unknown) => Promise<SecurityReportRow[]> };
      }
    ).securityReport.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map(toDto);
  }

  async getForWorkspace(id: string, workspaceId: string): Promise<SecurityReportDto> {
    const row = await (
      this.prisma as unknown as {
        securityReport: { findUnique: (args: unknown) => Promise<SecurityReportRow | null> };
      }
    ).securityReport.findUnique({ where: { id } });
    if (!row || row.workspaceId !== workspaceId) {
      throw new AppException('SECURITY_REPORT_NOT_FOUND', 'Security report not found.', HttpStatus.NOT_FOUND);
    }
    return toDto(row);
  }

  async generate(workspaceId: string, userId: string, dto: GenerateSecurityReportRequestDto): Promise<SecurityReportDto> {
    const windowDays = dto.windowDays && dto.windowDays > 0 ? dto.windowDays : 30;
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - windowDays * 24 * 60 * 60 * 1000);

    const content = await this.buildContent(workspaceId, dto.type);
    const title = dto.title ?? this.defaultTitle(dto.type);

    const row = await (
      this.prisma as unknown as {
        securityReport: { create: (args: unknown) => Promise<SecurityReportRow> };
      }
    ).securityReport.create({
      data: {
        workspaceId,
        type: dto.type,
        title,
        periodStart,
        periodEnd,
        contentJson: content,
        generatedBy: userId,
        generatedByAi: false,
      },
    });
    return toDto(row);
  }

  private defaultTitle(type: SecurityReportType): string {
    switch (type) {
      case 'INCIDENT_SUMMARY':
        return 'Incident Summary Report';
      case 'THREAT_INTEL_SUMMARY':
        return 'Threat Intelligence Summary Report';
      case 'POSTURE_SUMMARY':
        return 'Security Posture Summary Report';
    }
  }

  private async buildContent(workspaceId: string, type: SecurityReportType): Promise<SecurityReportContent> {
    switch (type) {
      case 'INCIDENT_SUMMARY':
        return this.buildIncidentSummary(workspaceId);
      case 'THREAT_INTEL_SUMMARY':
        return this.buildThreatIntelSummary(workspaceId);
      case 'POSTURE_SUMMARY':
        return this.buildPostureSummary(workspaceId);
    }
  }

  private async buildIncidentSummary(workspaceId: string): Promise<SecurityReportIncidentSummaryContentDto> {
    const incidents: IncidentDto[] = await this.incidents.listForWorkspace(workspaceId, { limit: 200 });
    const bySeverity: Record<IncidentSeverity, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
    const byStatus: Record<IncidentStatus, number> = {
      OPEN: 0,
      INVESTIGATING: 0,
      CONTAINMENT: 0,
      ERADICATION: 0,
      RECOVERY: 0,
      RESOLVED: 0,
      CLOSED: 0,
      REOPENED: 0,
    };
    let openIncidents = 0;
    for (const incident of incidents) {
      bySeverity[incident.severity] += 1;
      byStatus[incident.status] += 1;
      if (OPEN_LIKE_INCIDENT_STATUSES.has(incident.status)) openIncidents += 1;
    }

    const breachedEvents = await this.sla.listEventsForWorkspace(workspaceId, { breachedOnly: true, limit: 200 });

    return {
      totalIncidents: incidents.length,
      openIncidents,
      bySeverity,
      byStatus,
      slaBreaches: breachedEvents.length,
      incidents: incidents.slice(0, 25).map((i) => ({
        id: i.id,
        title: i.title,
        severity: i.severity,
        status: i.status,
        createdAt: i.createdAt,
      })),
    };
  }

  private async buildThreatIntelSummary(workspaceId: string): Promise<SecurityReportThreatIntelSummaryContentDto> {
    const indicators: IndicatorDto[] = await this.indicators.listForWorkspace(workspaceId, { limit: 500 });
    const byType: Partial<Record<IndicatorType, number>> = {};
    let activeIndicators = 0;
    for (const indicator of indicators) {
      byType[indicator.type] = (byType[indicator.type] ?? 0) + 1;
      if (indicator.status === 'ACTIVE') activeIndicators += 1;
    }
    const sortedByRecency = [...indicators].sort(
      (a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime(),
    );

    return {
      totalIndicators: indicators.length,
      activeIndicators,
      byType,
      recentIndicators: sortedByRecency.slice(0, 25).map((i) => ({
        id: i.id,
        type: i.type,
        value: i.value,
        confidence: i.confidence,
        source: i.source,
        lastSeenAt: i.lastSeenAt,
      })),
    };
  }

  private async buildPostureSummary(workspaceId: string): Promise<SecurityReportPostureSummaryContentDto> {
    const [metrics, tasks, incidents] = await Promise.all([
      this.securityMetrics.summary(workspaceId, 90),
      this.remediation.listForWorkspace(workspaceId, { limit: 500 }),
      this.incidents.listForWorkspace(workspaceId, { limit: 500 }),
    ]);

    const remediationByPriority: Record<RemediationPriority, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
    let openRemediationTasks = 0;
    let overdueRemediationTasks = 0;
    const now = Date.now();
    for (const task of tasks as RemediationTaskDto[]) {
      const isOpenLike = OPEN_LIKE_REMEDIATION_STATUSES.has(task.status);
      if (isOpenLike) {
        openRemediationTasks += 1;
        remediationByPriority[task.priority] += 1;
        if (task.dueDate && new Date(task.dueDate).getTime() < now) overdueRemediationTasks += 1;
      }
    }

    const incidentsBySeverity: Record<IncidentSeverity, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
    for (const incident of incidents) {
      incidentsBySeverity[incident.severity] += 1;
    }

    return {
      metrics,
      openRemediationTasks,
      overdueRemediationTasks,
      remediationByPriority,
      incidentsBySeverity,
    };
  }
}
