import { Inject } from '@nestjs/common';
import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { AnalyticsQueryDto, BugBountyAnalyticsDto } from '@pentesthub/shared';
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
  TARGETS_REPOSITORY,
  type TargetsRepository,
} from '../../targets/domain/repositories/targets.repository.interface.js';
import {
  ACTIVITY_REPOSITORY,
  type ActivityRepository,
} from '../../activity/domain/repositories/activity.repository.interface.js';
import { resolveWorkspaceForCaller } from '../authorization.util.js';

const TOP_N = 10;

export class GetBugBountyAnalyticsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly filter: AnalyticsQueryDto,
  ) {}
}

/// Module 9 Analytics — a read-model rollup over Module 6/9's existing
/// tables, no new storage of its own. Deliberately kept separate from
/// GetBugBountyStatisticsHandler (Module 6, no filters, workspace-wide
/// only): this handler adds `projectId`/`programId`/`from`/`to` filtering
/// and a different shape (severity distribution, top vuln types/targets,
/// recon coverage, activity timeline) rather than overloading one handler
/// with two purposes. Like GetBugBountyStatisticsHandler, this computes
/// from at-most-1000-row in-memory lists rather than SQL aggregates —
/// acceptable at personal-workspace scale, documented as a follow-up for
/// a true multi-tenant deployment.
@QueryHandler(GetBugBountyAnalyticsQuery)
export class GetBugBountyAnalyticsHandler implements IQueryHandler<
  GetBugBountyAnalyticsQuery,
  BugBountyAnalyticsDto
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
    @Inject(TARGETS_REPOSITORY)
    private readonly targetsRepository: TargetsRepository,
    @Inject(ACTIVITY_REPOSITORY)
    private readonly activityRepository: ActivityRepository,
  ) {}

  async execute(
    query: GetBugBountyAnalyticsQuery,
  ): Promise<BugBountyAnalyticsDto> {
    const workspace = await resolveWorkspaceForCaller(
      this.workspacesRepository,
      query.userId,
    );
    const { projectId, programId, from, to } = query.filter;
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;
    const inRange = (date: Date): boolean =>
      (!fromDate || date >= fromDate) && (!toDate || date <= toDate);

    const [programsAll, findingsAll, reportsAll, activityAll] =
      await Promise.all([
        this.programsRepository.list({
          workspaceId: workspace.id,
          ...(projectId ? { projectId } : {}),
        }),
        this.findingsRepository.list({
          workspaceId: workspace.id,
          ...(programId ? { programId } : {}),
          ...(projectId ? { projectId } : {}),
          limit: 1000,
        }),
        this.reportsRepository.list({
          workspaceId: workspace.id,
          ...(programId ? { programId } : {}),
          ...(projectId ? { projectId } : {}),
        }),
        this.activityRepository.list({
          workspaceId: workspace.id,
          ...(projectId ? { projectId } : {}),
          limit: 500,
        }),
      ]);

    const programs = programId
      ? programsAll.filter((p) => p.id === programId)
      : programsAll;
    const findings = findingsAll.filter((f) => inRange(f.createdAt));
    const reports = reportsAll.filter((r) => inRange(r.createdAt));
    const activity = activityAll.filter((e) => inRange(e.createdAt));

    // --- Severity distribution -------------------------------------------
    const severityCounts = new Map<string, number>();
    for (const f of findings) {
      severityCounts.set(f.severity, (severityCounts.get(f.severity) ?? 0) + 1);
    }
    const severityDistribution = [...severityCounts.entries()].map(
      ([severity, count]) => ({ severity, count }),
    );

    // --- Acceptance / duplicate rate (same formula as
    // GetBugBountyStatisticsHandler, scoped to the filtered report set) --
    const decided = reports.filter((r) => r.status !== 'DRAFT');
    const accepted = reports.filter((r) => r.status === 'ACCEPTED');
    const rejected = reports.filter((r) => r.status === 'REJECTED');
    const duplicate = reports.filter((r) => r.status === 'DUPLICATE');
    const acceptDecisionTotal = accepted.length + rejected.length;
    const acceptanceRate = acceptDecisionTotal
      ? accepted.length / acceptDecisionTotal
      : 0;
    const duplicateRate = decided.length
      ? duplicate.length / decided.length
      : 0;

    // --- Top vuln types -----------------------------------------------
    const vulnCounts = new Map<string, number>();
    for (const f of findings) {
      if (!f.vulnType) continue;
      vulnCounts.set(f.vulnType, (vulnCounts.get(f.vulnType) ?? 0) + 1);
    }
    const topVulnTypes = [...vulnCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_N)
      .map(([vulnType, count]) => ({ vulnType, count }));

    // --- Top targets ------------------------------------------------------
    const targetCounts = new Map<string, number>();
    for (const f of findings) {
      if (!f.targetId) continue;
      targetCounts.set(f.targetId, (targetCounts.get(f.targetId) ?? 0) + 1);
    }
    const topTargetEntries = [...targetCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_N);
    const topTargets = await Promise.all(
      topTargetEntries.map(async ([targetId, count]) => {
        const target = await this.targetsRepository.findById(targetId);
        return {
          targetId,
          targetValue: target?.value ?? 'Unknown target',
          findingsCount: count,
        };
      }),
    );

    // --- Recon coverage per program ----------------------------------
    // `scopeItemsWithLinkedTarget` approximates "declared scope actively
    // covered by a linked recon target" using the program-level
    // Target link count (Module 6's linkTarget/countLinkedTargets) —
    // scope items themselves don't carry an individual target link in
    // this schema, only the program does, so this is a program-wide
    // ratio rather than a per-item one. Capped at scopeItemsTotal so
    // coveragePercent never exceeds 100 (a program can have more linked
    // targets than declared scope items, e.g. after a scope prune).
    const reconCoverage = await Promise.all(
      programs.map(async (program) => {
        const [scopeItemsTotal, linkedTargets] = await Promise.all([
          this.programsRepository.countScopeItems(program.id),
          this.programsRepository.countLinkedTargets(program.id),
        ]);
        const scopeItemsWithLinkedTarget = Math.min(
          linkedTargets,
          scopeItemsTotal,
        );
        return {
          programId: program.id,
          programName: program.name,
          scopeItemsTotal,
          scopeItemsWithLinkedTarget,
          coveragePercent: scopeItemsTotal
            ? Math.round((scopeItemsWithLinkedTarget / scopeItemsTotal) * 100)
            : 0,
        };
      }),
    );

    // --- Response time (average + median) ----------------------------
    const triagedSamples = reports
      .filter((r) => r.submittedAt && r.triagedAt)
      .map((r) => hoursBetween(r.submittedAt as Date, r.triagedAt as Date));
    const resolvedSamples = reports
      .filter((r) => r.submittedAt && r.resolvedAt)
      .map((r) => hoursBetween(r.submittedAt as Date, r.resolvedAt as Date));
    const responseTime = {
      averageTimeToTriagedHours: average(triagedSamples),
      averageTimeToResolvedHours: average(resolvedSamples),
      medianTimeToTriagedHours: median(triagedSamples),
      medianTimeToResolvedHours: median(resolvedSamples),
    };

    // --- Activity timeline (daily buckets) -----------------------------
    const byDate = new Map<string, number>();
    for (const event of activity) {
      const day = event.createdAt.toISOString().slice(0, 10);
      byDate.set(day, (byDate.get(day) ?? 0) + 1);
    }
    const activityTimeline = [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, eventCount]) => ({ date, eventCount }));

    return {
      programsCount: programs.length,
      findingsCount: findings.length,
      severityDistribution,
      acceptanceRate,
      duplicateRate,
      topVulnTypes,
      topTargets,
      reconCoverage,
      responseTime,
      activityTimeline,
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

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}
