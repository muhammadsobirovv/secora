import { Injectable } from '@nestjs/common';
import type { EnterpriseReportContent } from '@pentesthub/shared';
import { PrismaService } from '../../prisma/prisma.service.js';
import { listOrganizationWorkspaceIds } from './organization-workspace-scope.util.js';

const SEVERITIES = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

function emptySeverityCounts(): Record<(typeof SEVERITIES)[number], number> {
  return { INFO: 0, LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
}

/// Assembles a real, computed `EnterpriseReportContent` snapshot from
/// live Prisma data — every number here is a genuine aggregate query
/// against `BugBountyFinding`/`VulnFinding`/`BugBountyProgram`/
/// `SlaPolicy` for the requested organization (and, optionally, one
/// workspace within it), not placeholder/mock data. This is the one
/// place report generation logic lives; `GenerateEnterpriseReportHandler`
/// and `ReportScheduleRunnerService` both call it so a manually-triggered
/// report and a scheduled one are byte-for-byte the same computation.
@Injectable()
export class ReportContentBuilderService {
  constructor(private readonly prisma: PrismaService) {}

  async build(params: {
    organizationId: string | null;
    workspaceId: string | null;
    periodStart: Date | null;
    periodEnd: Date | null;
  }): Promise<EnterpriseReportContent> {
    const workspaceIds = params.workspaceId
      ? [params.workspaceId]
      : params.organizationId
        ? await listOrganizationWorkspaceIds(this.prisma, params.organizationId)
        : [];

    const periodFilter =
      params.periodStart || params.periodEnd
        ? { gte: params.periodStart ?? undefined, lte: params.periodEnd ?? undefined }
        : undefined;

    if (workspaceIds.length === 0) {
      return {
        scope: { organizationId: params.organizationId, workspaceId: params.workspaceId, workspaceCount: 0 },
        period: { start: params.periodStart?.toISOString() ?? null, end: params.periodEnd?.toISOString() ?? null },
        findings: { totalOpen: 0, bySeverity: emptySeverityCounts(), byStage: {}, newInPeriod: 0, resolvedInPeriod: 0, averageResolutionHours: null },
        bounties: { totalPaid: 0, currency: 'USD', paidCount: 0 },
        programs: { total: 0, active: 0 },
        vulnScans: { totalFindingsBySeverity: emptySeverityCounts() },
        slaCompliance: null,
        generatedAt: new Date().toISOString(),
      };
    }

    const workspaceWhere = { workspaceId: { in: workspaceIds }, deletedAt: null };

    const [severityGroups, stageGroups, newInPeriod, resolvedFindings, bountyAgg, programTotal, programActive, vulnSeverityGroups, slaPolicies] =
      await Promise.all([
        this.prisma.bugBountyFinding.groupBy({ by: ['severity'], where: workspaceWhere, _count: { _all: true } }),
        this.prisma.bugBountyFinding.groupBy({ by: ['stage'], where: workspaceWhere, _count: { _all: true } }),
        periodFilter
          ? this.prisma.bugBountyFinding.count({ where: { ...workspaceWhere, createdAt: periodFilter } })
          : Promise.resolve(0),
        periodFilter
          ? this.prisma.bugBountyFinding.findMany({
              where: { ...workspaceWhere, stage: 'RESOLVED', updatedAt: periodFilter },
              select: { createdAt: true, updatedAt: true },
            })
          : Promise.resolve([] as { createdAt: Date; updatedAt: Date }[]),
        this.prisma.bugBountyFinding.aggregate({
          where: { ...workspaceWhere, bountyAmount: { not: null } },
          _sum: { bountyAmount: true },
          _count: { bountyAmount: true },
        }),
        this.prisma.bugBountyProgram.count({ where: { workspaceId: { in: workspaceIds }, deletedAt: null } }),
        this.prisma.bugBountyProgram.count({ where: { workspaceId: { in: workspaceIds }, deletedAt: null, status: 'ACTIVE' } }),
        this.prisma.vulnFinding.groupBy({ by: ['severity'], where: { workspaceId: { in: workspaceIds } }, _count: { _all: true } }),
        params.organizationId
          ? this.prisma.slaPolicy.findMany({ where: { organizationId: params.organizationId } })
          : Promise.resolve([]),
      ]);

    const bySeverity = emptySeverityCounts();
    for (const group of severityGroups) bySeverity[group.severity] = group._count._all;

    const byStage: Record<string, number> = {};
    for (const group of stageGroups) byStage[group.stage] = group._count._all;

    const totalOpen = Object.entries(byStage)
      .filter(([stage]) => !['RESOLVED', 'CLOSED', 'ARCHIVED', 'REJECTED', 'DUPLICATE', 'INFORMATIVE'].includes(stage))
      .reduce((sum, [, count]) => sum + count, 0);

    const averageResolutionHours =
      resolvedFindings.length > 0
        ? resolvedFindings.reduce((sum, f) => sum + (f.updatedAt.getTime() - f.createdAt.getTime()), 0) /
          resolvedFindings.length /
          (1000 * 60 * 60)
        : null;

    const vulnBySeverity = emptySeverityCounts();
    for (const group of vulnSeverityGroups) vulnBySeverity[group.severity] = group._count._all;

    let slaCompliance: EnterpriseReportContent['slaCompliance'] = null;
    if (slaPolicies.length > 0) {
      // Module 18 — task #516 (API performance audit). This used to issue
      // one `findMany` per SLA policy row — an org can have multiple
      // policies sharing the same severity (an org-wide policy plus a
      // per-workspace override, per the `@@unique([organizationId,
      // workspaceId, severity])` constraint on SlaPolicy), so that could
      // even re-fetch the identical finding set more than once. A single
      // query for every severity referenced by any policy, grouped in
      // memory, produces the exact same per-policy evaluation with one
      // round-trip instead of N.
      const severities = [...new Set(slaPolicies.map((p) => p.severity))];
      const findingsBySeverity = await this.prisma.bugBountyFinding.findMany({
        where: { ...workspaceWhere, severity: { in: severities }, stage: { in: ['RESOLVED', 'CLOSED'] } },
        select: { severity: true, createdAt: true, updatedAt: true },
      });
      const grouped = new Map<string, { createdAt: Date; updatedAt: Date }[]>();
      for (const finding of findingsBySeverity) {
        const bucket = grouped.get(finding.severity);
        if (bucket) bucket.push(finding);
        else grouped.set(finding.severity, [finding]);
      }

      let evaluated = 0;
      let withinTarget = 0;
      for (const policy of slaPolicies) {
        for (const finding of grouped.get(policy.severity) ?? []) {
          evaluated += 1;
          const hours = (finding.updatedAt.getTime() - finding.createdAt.getTime()) / (1000 * 60 * 60);
          if (hours <= policy.targetHours) withinTarget += 1;
        }
      }
      slaCompliance = { policiesEvaluated: slaPolicies.length, withinTargetPct: evaluated > 0 ? Math.round((withinTarget / evaluated) * 1000) / 10 : null };
    }

    return {
      scope: { organizationId: params.organizationId, workspaceId: params.workspaceId, workspaceCount: workspaceIds.length },
      period: { start: params.periodStart?.toISOString() ?? null, end: params.periodEnd?.toISOString() ?? null },
      findings: {
        totalOpen,
        bySeverity,
        byStage,
        newInPeriod,
        resolvedInPeriod: resolvedFindings.length,
        averageResolutionHours: averageResolutionHours !== null ? Math.round(averageResolutionHours * 10) / 10 : null,
      },
      bounties: {
        totalPaid: bountyAgg._sum.bountyAmount ?? 0,
        currency: 'USD',
        paidCount: bountyAgg._count.bountyAmount,
      },
      programs: { total: programTotal, active: programActive },
      vulnScans: { totalFindingsBySeverity: vulnBySeverity },
      slaCompliance,
      generatedAt: new Date().toISOString(),
    };
  }
}
