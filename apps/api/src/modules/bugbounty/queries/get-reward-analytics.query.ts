import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import type { RewardTotalsDto, SubmissionAnalyticsDto } from '@pentesthub/shared';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  SUBMISSIONS_REPOSITORY,
  type SubmissionsRepository,
} from '../domain/repositories/submissions.repository.interface.js';
import { resolveWorkspaceForCaller } from '../authorization.util.js';

export class GetRewardAnalyticsQuery implements IQuery {
  constructor(public readonly userId: string) {}
}

const RESOLVED_STATUSES = new Set(['RESOLVED', 'BOUNTY_PAID', 'CLOSED']);

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function yearKey(d: Date): string {
  return String(d.getUTCFullYear());
}

/// Module 16 — Bug Bounty Submissions + Rewards (task #385). Reward
/// tracking analytics: Total/Monthly/Yearly Rewards, Accepted Findings,
/// Duplicate Rate, Average Time to Response, Average Time to Resolution
/// — the exact set named in the spec.
///
/// Two disclosed simplifications, both forced by the fixed RewardTotalsDto
/// shape (single top-level `currency`, not a per-currency breakdown):
///   1. `rewards` totals only the ledger's *dominant* currency (the one
///      with the most entries; USD if the ledger is empty) — a workspace
///      that earns bounties in more than one currency will see a partial
///      total here, not a converted/combined one. True multi-currency
///      rollup would need a currency-keyed DTO shape, which is out of
///      scope for this pass.
///   2. `averageTimeToResolutionHours` uses `updatedAt` on RESOLVED/
///      BOUNTY_PAID/CLOSED submissions as a proxy for "resolved at",
///      since Submission has no dedicated resolvedAt column (see
///      SubmissionAnalyticsProjection's doc comment).
@QueryHandler(GetRewardAnalyticsQuery)
export class GetRewardAnalyticsHandler implements IQueryHandler<
  GetRewardAnalyticsQuery,
  SubmissionAnalyticsDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(SUBMISSIONS_REPOSITORY)
    private readonly submissionsRepository: SubmissionsRepository,
  ) {}

  async execute(query: GetRewardAnalyticsQuery): Promise<SubmissionAnalyticsDto> {
    const workspace = await resolveWorkspaceForCaller(
      this.workspacesRepository,
      query.userId,
    );

    const [ledger, submissions] = await Promise.all([
      this.submissionsRepository.listRewardLedgerForWorkspace(workspace.id),
      this.submissionsRepository.listAnalyticsProjection(workspace.id),
    ]);

    // --- Reward totals (dominant currency) --------------------------------
    const currencyCounts = new Map<string, number>();
    for (const entry of ledger) {
      currencyCounts.set(entry.currency, (currencyCounts.get(entry.currency) ?? 0) + 1);
    }
    let dominantCurrency = 'USD';
    let maxCount = 0;
    for (const [currency, count] of currencyCounts) {
      if (count > maxCount) {
        dominantCurrency = currency;
        maxCount = count;
      }
    }

    const relevantEntries = ledger.filter((e) => e.currency === dominantCurrency);
    const monthlyMap = new Map<string, number>();
    const yearlyMap = new Map<string, number>();
    let allTimeNet = 0;
    for (const entry of relevantEntries) {
      allTimeNet += entry.netAmount;
      const mk = monthKey(entry.occurredAt);
      const yk = yearKey(entry.occurredAt);
      monthlyMap.set(mk, (monthlyMap.get(mk) ?? 0) + entry.netAmount);
      yearlyMap.set(yk, (yearlyMap.get(yk) ?? 0) + entry.netAmount);
    }

    const rewards: RewardTotalsDto = {
      currency: dominantCurrency,
      monthly: [...monthlyMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([period, totalNet]) => ({ period, totalNet })),
      yearly: [...yearlyMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([period, totalNet]) => ({ period, totalNet })),
      allTimeNet,
    };

    // --- Submission-level analytics ----------------------------------------
    const totalSubmissions = submissions.length;
    const acceptedFindings = submissions.filter((s) => s.status === 'ACCEPTED').length;
    const duplicateFindings = submissions.filter((s) => s.status === 'DUPLICATE').length;
    const duplicateRatePercent =
      totalSubmissions > 0 ? (duplicateFindings / totalSubmissions) * 100 : null;

    const responseTimes = submissions
      .filter((s) => s.responseAt)
      .map((s) => (s.responseAt!.getTime() - s.createdAt.getTime()) / 3_600_000);
    const averageTimeToResponseHours =
      responseTimes.length > 0
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
        : null;

    const resolutionTimes = submissions
      .filter((s) => RESOLVED_STATUSES.has(s.status))
      .map((s) => (s.updatedAt.getTime() - s.createdAt.getTime()) / 3_600_000);
    const averageTimeToResolutionHours =
      resolutionTimes.length > 0
        ? resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length
        : null;

    return {
      rewards,
      totalSubmissions,
      acceptedFindings,
      duplicateFindings,
      duplicateRatePercent,
      averageTimeToResponseHours,
      averageTimeToResolutionHours,
    };
  }
}
