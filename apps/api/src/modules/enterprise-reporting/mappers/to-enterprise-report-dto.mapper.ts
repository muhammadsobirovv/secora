import type { EnterpriseReportContent, EnterpriseReportDto, ReportScheduleDto } from '@pentesthub/shared';
import type { EnterpriseReport, ReportSchedule } from '../../../prisma-types.js';

export function toEnterpriseReportDto(row: EnterpriseReport): EnterpriseReportDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    type: row.type,
    title: row.title,
    periodStart: row.periodStart ? row.periodStart.toISOString() : null,
    periodEnd: row.periodEnd ? row.periodEnd.toISOString() : null,
    content: row.contentJson as unknown as EnterpriseReportContent,
    generatedBy: row.generatedBy,
    generatedByAi: row.generatedByAi,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toReportScheduleDto(row: ReportSchedule): ReportScheduleDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    type: row.type,
    cronExpression: row.cronExpression,
    recipients: row.recipients,
    active: row.active,
    lastRunAt: row.lastRunAt ? row.lastRunAt.toISOString() : null,
    nextRunAt: row.nextRunAt ? row.nextRunAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
