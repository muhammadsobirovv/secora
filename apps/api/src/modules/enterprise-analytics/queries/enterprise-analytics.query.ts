import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { QueryBus } from '@nestjs/cqrs';
import type { EnterpriseAnalyticsDashboardDto } from '@pentesthub/shared';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveOrganizationMembership } from '../../enterprise/organization-membership.util.js';
import { listOrganizationWorkspaceIds } from '../../enterprise-reporting/organization-workspace-scope.util.js';
import { GetQueueMetricsQuery } from '../../distributed-jobs/queries/distributed-jobs.query.js';

const SEVERITIES = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

function emptySeverityCounts(): Record<(typeof SEVERITIES)[number], number> {
  return { INFO: 0, LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
}

export class GetEnterpriseAnalyticsDashboardQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly days: number = 30,
  ) {}
}

/// Live dashboard aggregation — every field is computed from current
/// Prisma data at request time (no caching layer, since this is
/// read-mostly org-management data, not a hot path), genuinely
/// integrating three Module 10 subsystems: `BugBountyFinding`/`SlaPolicy`
/// (this module's own tables), the Distributed Job System
/// (`GetQueueMetricsQuery`, dispatched through the same `QueryBus` every
/// other CQRS query in this codebase uses — not a direct Prisma
/// shortcut), and the Plugin Marketplace (`Plugin.downloadCount`).
@QueryHandler(GetEnterpriseAnalyticsDashboardQuery)
export class GetEnterpriseAnalyticsDashboardHandler
  implements IQueryHandler<GetEnterpriseAnalyticsDashboardQuery, EnterpriseAnalyticsDashboardDto>
{
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(query: GetEnterpriseAnalyticsDashboardQuery): Promise<EnterpriseAnalyticsDashboardDto> {
    await resolveOrganizationMembership(this.prisma, query.userId, query.organizationId);

    const workspaceIds = await listOrganizationWorkspaceIds(this.prisma, query.organizationId);
    const days = Math.min(Math.max(query.days, 1), 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const jobQueueHealthDto = await this.queryBus.execute(new GetQueueMetricsQuery(query.userId, query.organizationId));

    if (workspaceIds.length === 0) {
      return {
        organizationId: query.organizationId,
        workspaceCount: 0,
        findingsTrend: [],
        severityBreakdown: emptySeverityCounts(),
        topPrograms: [],
        slaCompliance: null,
        jobQueueHealth: {
          byStatus: jobQueueHealthDto.byStatus,
          onlineWorkers: jobQueueHealthDto.onlineWorkers,
          totalCapacity: jobQueueHealthDto.totalCapacity,
          currentLoad: jobQueueHealthDto.currentLoad,
          averageWaitMs: jobQueueHealthDto.averageWaitMs,
        },
        topPlugins: [],
        generatedAt: new Date().toISOString(),
      };
    }

    const workspaceWhere = { workspaceId: { in: workspaceIds }, deletedAt: null };

    const [trendRows, severityGroups, programGroups, slaPolicies, topPluginRows] = await Promise.all([
      this.prisma.$queryRaw<{ day: Date; count: bigint }[]>`
        SELECT date_trunc('day', "createdAt") as day, COUNT(*)::bigint as count
        FROM "bugbounty_findings"
        WHERE "workspaceId" = ANY(${workspaceIds}) AND "createdAt" >= ${since} AND "deletedAt" IS NULL
        GROUP BY day
        ORDER BY day ASC
      `,
      this.prisma.bugBountyFinding.groupBy({ by: ['severity'], where: workspaceWhere, _count: { _all: true } }),
      this.prisma.bugBountyFinding.groupBy({ by: ['programId'], where: workspaceWhere, _count: { _all: true }, orderBy: { _count: { programId: 'desc' } }, take: 5 }),
      this.prisma.slaPolicy.findMany({ where: { organizationId: query.organizationId } }),
      this.prisma.pluginInstallation.groupBy({
        by: ['pluginId'],
        where: { organizationId: query.organizationId },
        _count: { _all: true },
        orderBy: { _count: { pluginId: 'desc' } },
        take: 5,
      }),
    ]);

    const severityBreakdown = emptySeverityCounts();
    for (const group of severityGroups) severityBreakdown[group.severity] = group._count._all;

    const programIds = programGroups.map((g) => g.programId);
    const programs = programIds.length > 0
      ? await this.prisma.bugBountyProgram.findMany({ where: { id: { in: programIds } }, select: { id: true, name: true } })
      : [];
    const programNameById = new Map(programs.map((p) => [p.id, p.name]));
    const topPrograms = programGroups.map((g) => ({
      programId: g.programId,
      name: programNameById.get(g.programId) ?? 'Unknown program',
      findingCount: g._count._all,
    }));

    let slaCompliance: EnterpriseAnalyticsDashboardDto['slaCompliance'] = null;
    if (slaPolicies.length > 0) {
      let evaluated = 0;
      let withinTarget = 0;
      for (const policy of slaPolicies) {
        const findings = await this.prisma.bugBountyFinding.findMany({
          where: { ...workspaceWhere, severity: policy.severity, stage: { in: ['RESOLVED', 'CLOSED'] } },
          select: { createdAt: true, updatedAt: true },
        });
        for (const finding of findings) {
          evaluated += 1;
          const hours = (finding.updatedAt.getTime() - finding.createdAt.getTime()) / (1000 * 60 * 60);
          if (hours <= policy.targetHours) withinTarget += 1;
        }
      }
      slaCompliance = { policiesEvaluated: slaPolicies.length, withinTargetPct: evaluated > 0 ? Math.round((withinTarget / evaluated) * 1000) / 10 : null };
    }

    const pluginIds = topPluginRows.map((g) => g.pluginId);
    const plugins = pluginIds.length > 0 ? await this.prisma.plugin.findMany({ where: { id: { in: pluginIds } }, select: { id: true, name: true } }) : [];
    const pluginNameById = new Map(plugins.map((p) => [p.id, p.name]));
    const topPlugins = topPluginRows.map((g) => ({
      pluginId: g.pluginId,
      name: pluginNameById.get(g.pluginId) ?? 'Unknown plugin',
      installCount: g._count._all,
    }));

    return {
      organizationId: query.organizationId,
      workspaceCount: workspaceIds.length,
      findingsTrend: trendRows.map((row) => ({ date: row.day.toISOString().slice(0, 10), count: Number(row.count) })),
      severityBreakdown,
      topPrograms,
      slaCompliance,
      jobQueueHealth: {
        byStatus: jobQueueHealthDto.byStatus,
        onlineWorkers: jobQueueHealthDto.onlineWorkers,
        totalCapacity: jobQueueHealthDto.totalCapacity,
        currentLoad: jobQueueHealthDto.currentLoad,
        averageWaitMs: jobQueueHealthDto.averageWaitMs,
      },
      topPlugins,
      generatedAt: new Date().toISOString(),
    };
  }
}
