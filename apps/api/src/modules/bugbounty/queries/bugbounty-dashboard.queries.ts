import { Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type {
  BugBountyDashboardDto,
  BugBountyPlatform,
  BugBountyStatisticsDto,
  BugReportStatus,
} from '@pentesthub/shared';
import type { EnvConfig } from '../../../config/env.validation.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  BUGBOUNTY_PROGRAMS_REPOSITORY,
  type BugBountyProgramsRepository,
} from '../domain/repositories/bugbounty-programs.repository.interface.js';
import {
  BUGBOUNTY_FINDINGS_REPOSITORY,
  type BugBountyFindingsRepository,
} from '../domain/repositories/bugbounty-findings.repository.interface.js';
import {
  BUG_REPORTS_REPOSITORY,
  type BugReportsRepository,
} from '../domain/repositories/bug-reports.repository.interface.js';
import {
  ACTIVITY_REPOSITORY,
  type ActivityRepository,
} from '../../activity/domain/repositories/activity.repository.interface.js';
import { resolveWorkspaceForCaller } from '../authorization.util.js';
import { toBugBountyFindingDto } from '../mappers/to-bugbounty-finding-dto.mapper.js';

const SEVERITY_SCALE: Record<string, number> = {
  INFO: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export class GetBugBountyDashboardQuery implements IQuery {
  constructor(public readonly userId: string) {}
}

@QueryHandler(GetBugBountyDashboardQuery)
export class GetBugBountyDashboardHandler implements IQueryHandler<
  GetBugBountyDashboardQuery,
  BugBountyDashboardDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(BUGBOUNTY_PROGRAMS_REPOSITORY)
    private readonly programsRepository: BugBountyProgramsRepository,
    @Inject(BUGBOUNTY_FINDINGS_REPOSITORY)
    private readonly findingsRepository: BugBountyFindingsRepository,
    @Inject(BUG_REPORTS_REPOSITORY)
    private readonly reportsRepository: BugReportsRepository,
    @Inject(ACTIVITY_REPOSITORY)
    private readonly activityRepository: ActivityRepository,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  async execute(
    query: GetBugBountyDashboardQuery,
  ): Promise<BugBountyDashboardDto> {
    const workspace = await resolveWorkspaceForCaller(
      this.workspacesRepository,
      query.userId,
    );

    const [programs, recentFindings, reportStatusCounts, activity] =
      await Promise.all([
        this.programsRepository.list({ workspaceId: workspace.id }),
        this.findingsRepository.list({ workspaceId: workspace.id, limit: 5 }),
        this.reportsRepository.countByStatus(workspace.id),
        this.activityRepository.list({ workspaceId: workspace.id, limit: 10 }),
      ]);

    const activePrograms = programs.filter((p) => p.status === 'ACTIVE');
    const inScopeAssetsCount = (
      await Promise.all(
        activePrograms.map((p) =>
          this.programsRepository.countLinkedTargets(p.id),
        ),
      )
    ).reduce((sum, n) => sum + n, 0);

    const earnedStatuses: BugReportStatus[] = [
      'ACCEPTED',
      'RESOLVED',
      'CLOSED',
    ];
    const earnedAmounts = await Promise.all(
      earnedStatuses.map((status) =>
        this.reportsRepository.sumBountyAmount(workspace.id, status),
      ),
    );
    const totalBountyEarned = earnedAmounts.reduce((sum, n) => sum + n, 0);

    const recentFindingDtos = await Promise.all(
      recentFindings.map(async (finding) => {
        const evidenceIds = await this.findingsRepository.listEvidenceIds(
          finding.id,
        );
        return toBugBountyFindingDto(finding, evidenceIds);
      }),
    );

    return {
      activeProgramsCount: activePrograms.length,
      inScopeAssetsCount,
      recentFindings: recentFindingDtos,
      reportStatusCounts,
      submittedReportsCount: reportStatusCounts.SUBMITTED,
      acceptedReportsCount: reportStatusCounts.ACCEPTED,
      totalBountyEarned,
      currency: this.configService.get('BUGBOUNTY_DEFAULT_CURRENCY', {
        infer: true,
      }),
      pendingReportsCount:
        reportStatusCounts.SUBMITTED + reportStatusCounts.TRIAGED,
      duplicateReportsCount: reportStatusCounts.DUPLICATE,
      recentActivity: activity.map((event) => ({
        verb: event.verb,
        entityType: event.entityType,
        entityId: event.entityId,
        createdAt: event.createdAt.toISOString(),
      })),
    };
  }
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

export class GetBugBountyStatisticsQuery implements IQuery {
  constructor(public readonly userId: string) {}
}

/// All rates/averages here are computed from at most the workspace's most
/// recent 1000 reports/findings (repository list() caps), not a SQL
/// aggregate — acceptable for a dashboard-scale statistics view; a
/// workspace with more than 1000 bug bounty reports would need a
/// dedicated aggregate query, noted as a follow-up rather than solved
/// here.
@QueryHandler(GetBugBountyStatisticsQuery)
export class GetBugBountyStatisticsHandler implements IQueryHandler<
  GetBugBountyStatisticsQuery,
  BugBountyStatisticsDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(BUGBOUNTY_PROGRAMS_REPOSITORY)
    private readonly programsRepository: BugBountyProgramsRepository,
    @Inject(BUGBOUNTY_FINDINGS_REPOSITORY)
    private readonly findingsRepository: BugBountyFindingsRepository,
    @Inject(BUG_REPORTS_REPOSITORY)
    private readonly reportsRepository: BugReportsRepository,
  ) {}

  async execute(
    query: GetBugBountyStatisticsQuery,
  ): Promise<BugBountyStatisticsDto> {
    const workspace = await resolveWorkspaceForCaller(
      this.workspacesRepository,
      query.userId,
    );

    const [programs, findings, reports] = await Promise.all([
      this.programsRepository.list({ workspaceId: workspace.id }),
      this.findingsRepository.list({ workspaceId: workspace.id, limit: 1000 }),
      this.reportsRepository.list({ workspaceId: workspace.id }),
    ]);

    const decided = reports.filter((r) => r.status !== 'DRAFT');
    const accepted = reports.filter((r) => r.status === 'ACCEPTED');
    const rejected = reports.filter((r) => r.status === 'REJECTED');
    const resolvedOrClosed = reports.filter(
      (r) => r.status === 'RESOLVED' || r.status === 'CLOSED',
    );
    const duplicate = reports.filter((r) => r.status === 'DUPLICATE');

    const successCount = accepted.length + resolvedOrClosed.length;
    const successRate = decided.length ? successCount / decided.length : 0;
    const acceptDecisionTotal = accepted.length + rejected.length;
    const acceptanceRate = acceptDecisionTotal
      ? accepted.length / acceptDecisionTotal
      : 0;
    const duplicateRate = decided.length
      ? duplicate.length / decided.length
      : 0;

    const severities = findings
      .map((f) => SEVERITY_SCALE[f.severity])
      .filter((n): n is number => n !== undefined);
    const averageSeverity = severities.length
      ? severities.reduce((sum, n) => sum + n, 0) / severities.length
      : 0;

    const averageReportTimeHours = average(
      reports
        .filter((r) => r.submittedAt)
        .map((r) => hoursBetween(r.createdAt, r.submittedAt as Date)),
    );
    const averageTimeToTriagedHours = average(
      reports
        .filter((r) => r.submittedAt && r.triagedAt)
        .map((r) => hoursBetween(r.submittedAt as Date, r.triagedAt as Date)),
    );
    const averageTimeToResolvedHours = average(
      reports
        .filter((r) => r.submittedAt && r.resolvedAt)
        .map((r) => hoursBetween(r.submittedAt as Date, r.resolvedAt as Date)),
    );

    const totalEarnings = reports
      .filter((r) => r.bountyAmount != null)
      .reduce((sum, r) => sum + (r.bountyAmount ?? 0), 0);

    const monthlyEarnings = buildMonthlyEarnings(
      reports.filter((r) => r.bountyAmount != null && r.resolvedAt),
    );

    const platformById = new Map(programs.map((p) => [p.id, p.platform]));
    const platformComparison = buildPlatformComparison(reports, platformById);

    return {
      successRate,
      acceptanceRate,
      duplicateRate,
      averageSeverity,
      averageReportTimeHours,
      averageTimeToTriagedHours,
      averageTimeToResolvedHours,
      totalEarnings,
      monthlyEarnings,
      platformComparison,
    };
  }
}

function hoursBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (1000 * 60 * 60);
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, n) => sum + n, 0) / values.length;
}

function buildMonthlyEarnings(
  reports: { resolvedAt: Date | null; bountyAmount: number | null }[],
): { month: string; amount: number }[] {
  const byMonth = new Map<string, number>();
  for (const report of reports) {
    if (!report.resolvedAt || report.bountyAmount == null) continue;
    const month = report.resolvedAt.toISOString().slice(0, 7); // YYYY-MM
    byMonth.set(month, (byMonth.get(month) ?? 0) + report.bountyAmount);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, amount]) => ({ month, amount }));
}

function buildPlatformComparison(
  reports: {
    programId: string;
    status: BugReportStatus;
    bountyAmount: number | null;
  }[],
  platformById: Map<string, BugBountyPlatform>,
): {
  platform: BugBountyPlatform;
  reports: number;
  accepted: number;
  earnings: number;
}[] {
  const byPlatform = new Map<
    BugBountyPlatform,
    { reports: number; accepted: number; earnings: number }
  >();
  for (const report of reports) {
    const platform = platformById.get(report.programId);
    if (!platform) continue;
    const entry = byPlatform.get(platform) ?? {
      reports: 0,
      accepted: 0,
      earnings: 0,
    };
    entry.reports += 1;
    if (
      report.status === 'ACCEPTED' ||
      report.status === 'RESOLVED' ||
      report.status === 'CLO