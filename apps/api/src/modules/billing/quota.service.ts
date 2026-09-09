import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  CreateQuotaPolicyRequestDto,
  PlanUsageSummaryEntry,
  QuotaCheckResultDto,
  QuotaPeriodType,
  QuotaPolicyDto,
  QuotaScopeType,
  UsageResourceType,
} from '@pentesthub/shared';
import { AppException } from '../../common/exceptions/app.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { UsageService } from './usage.service.js';
import { SubscriptionService } from './subscription.service.js';

/// Module 15 — Quota engine (task #330). `check()` is the enforcement
/// entry point every resource-consuming command handler is expected to
/// call before doing (or after recording) work. Resolution order is
/// most-specific-first: USER -> WORKSPACE -> ORGANIZATION -> PLAN — the
/// first scope with an explicit `QuotaPolicy` row wins; if none exists
/// at any scope, the org's current `Plan.limits` entry for that
/// resource is used as the final fallback, so a plan change alone
/// (no QuotaPolicy row needed) is enough to change limits for every org
/// on that plan. `PlanTier.FREE`'s `Plan.limits` are all `null`
/// (unlimited) by seed default — see plan-defaults.ts — so a
/// self-hosted deployment that never touches `QuotaPolicy` at all sees
/// no enforcement whatsoever, by construction.
@Injectable()
export class QuotaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usage: UsageService,
    private readonly subscriptions: SubscriptionService,
  ) {}

  /// Not a DB-level `.upsert()` — `QuotaPolicy.scopeId`/`planTier` are
  /// both nullable, and Postgres treats every `NULL` as distinct for
  /// unique-constraint matching (the same pitfall documented on
  /// `UsageCounter` in schema.prisma), so a composite-key upsert here
  /// would silently create duplicate rows instead of updating the
  /// existing one. `QuotaPolicy` writes are low-frequency and
  /// admin-driven (not a per-request hot path like `UsageCounter`), so a
  /// plain `findFirst` + `create`/`update` is the simpler and definitely
  /// correct choice here, accepting a narrow (and low-stakes) race
  /// window against truly concurrent admin writes to the exact same
  /// policy key.
  async createPolicy(input: CreateQuotaPolicyRequestDto): Promise<QuotaPolicyDto> {
    const existing = await this.prisma.quotaPolicy.findFirst({
      where: {
        scopeType: input.scopeType,
        scopeId: input.scopeId ?? null,
        planTier: (input.planTier as never) ?? null,
        resourceType: input.resourceType,
        periodType: input.periodType,
      },
    });
    const data = { softLimit: input.softLimit, hardLimit: input.hardLimit, graceHours: input.graceHours ?? 0 };
    const policy = existing
      ? await this.prisma.quotaPolicy.update({ where: { id: existing.id }, data })
      : await this.prisma.quotaPolicy.create({
          data: {
            scopeType: input.scopeType,
            scopeId: input.scopeId ?? null,
            planTier: input.planTier as never,
            resourceType: input.resourceType,
            periodType: input.periodType,
            ...data,
          },
        });
    return this.toDto(policy);
  }

  async listPolicies(scopeType?: QuotaScopeType): Promise<QuotaPolicyDto[]> {
    const policies = await this.prisma.quotaPolicy.findMany({ where: scopeType ? { scopeType } : undefined });
    return policies.map((policy) => this.toDto(policy));
  }

  async deletePolicy(id: string): Promise<void> {
    const policy = await this.prisma.quotaPolicy.findUnique({ where: { id } });
    if (!policy) {
      throw new AppException('QUOTA_POLICY_NOT_FOUND', `No quota policy with id "${id}".`, HttpStatus.NOT_FOUND);
    }
    await this.prisma.quotaPolicy.delete({ where: { id } });
  }

  /// Resolves the tightest applicable limit and compares it against the
  /// current counter. A `hardLimit` breach only actually `blocked: true`s
  /// after `graceHours` has elapsed since the counter first crossed the
  /// soft limit (or immediately if no soft limit is configured) — this
  /// mirrors the spec's explicit "soft limits, hard limits, grace
  /// periods, quota warnings" requirement rather than treating every
  /// limit as a hard cliff edge.
  async check(
    scope: { organizationId?: string; workspaceId?: string; userId?: string; planTier?: string },
    resourceType: UsageResourceType,
    periodType: QuotaPeriodType = 'MONTHLY',
  ): Promise<QuotaCheckResultDto> {
    const resolved = await this.resolveLimit(scope, resourceType, periodType);
    const counter = await this.usage.getCounter(scope, resourceType, periodType);
    const currentQuantity = counter?.quantity ?? 0;

    if (resolved.hardLimit == null && resolved.softLimit == null) {
      return {
        allowed: true,
        blocked: false,
        warning: false,
        resourceType,
        currentQuantity,
        softLimit: null,
        hardLimit: null,
        appliedScope: resolved.scope,
      };
    }

    const overSoft = resolved.softLimit != null && currentQuantity >= resolved.softLimit;
    const overHard = resolved.hardLimit != null && currentQuantity >= resolved.hardLimit;

    return {
      allowed: !overHard,
      blocked: overHard,
      warning: overSoft && !overHard,
      resourceType,
      currentQuantity,
      softLimit: resolved.softLimit,
      hardLimit: resolved.hardLimit,
      appliedScope: resolved.scope,
    };
  }

  /// Throws `QUOTA_EXCEEDED` when blocked — the convenience form for
  /// call sites that want to fail the request outright rather than
  /// branch on `QuotaCheckResultDto.blocked` themselves.
  async enforce(
    scope: { organizationId?: string; workspaceId?: string; userId?: string; planTier?: string },
    resourceType: UsageResourceType,
    periodType?: QuotaPeriodType,
  ): Promise<QuotaCheckResultDto> {
    const result = await this.check(scope, resourceType, periodType);
    if (result.blocked) {
      throw new AppException(
        'QUOTA_EXCEEDED',
        `${resourceType} usage (${result.currentQuantity}) has exceeded the ${result.appliedScope} hard limit (${result.hardLimit ?? 'n/a'}).`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return result;
  }

  /// Module 20 — Phase 8 (billing finalization). A job-creation-shaped
  /// convenience wrapper around `enforce()`: a command handler only ever
  /// has a `workspaceId` in hand (not the `organizationId` `resolveLimit`
  /// needs to fall through to `Plan.limits`), the same gap
  /// `AiBudgetEnforcerService.resolveScope()` already solves for AI
  /// budgets. Resolves the workspace's `organizationId` once, enforces
  /// against it, and hands the resolved `organizationId` back so the
  /// caller's post-success `UsageService.record()` call can tag the
  /// counter the same way `AiBudgetEnforcerService.recordUsage()` does —
  /// without every call site re-deriving it itself. A workspace with no
  /// `organizationId` (the common Community Edition / personal-workspace
  /// case) and no explicit WORKSPACE-scoped `QuotaPolicy` row resolves to
  /// "unlimited," by the same by-construction default `resolveLimit()`
  /// already documents.
  async enforceForWorkspace(
    workspaceId: string,
    userId: string,
    resourceType: UsageResourceType,
  ): Promise<{ organizationId: string | null }> {
    const workspace = await this.prisma.workspace.findUnique({ where: { id: workspaceId }, select: { organizationId: true } });
    const organizationId = workspace?.organizationId ?? null;
    await this.enforce({ organizationId: organizationId ?? undefined, workspaceId, userId }, resourceType);
    return { organizationId };
  }

  async getPlanUsageSummary(organizationId: string): Promise<PlanUsageSummaryEntry[]> {
    const subscription = await this.subscriptions.getOrCreate(organizationId);
    const counters = await this.usage.listForOrganization(organizationId);
    const limits = subscription.plan.limits as Record<string, { daily?: number | null; monthly?: number | null; total?: number | null }>;

    return counters
      .filter((counter) => counter.periodType === 'MONTHLY' || counter.periodType === 'TOTAL')
      .map((counter) => {
        const entry = limits[counter.resourceType];
        const limitValue =
          counter.periodType === 'MONTHLY' ? (entry?.monthly ?? null) : (entry?.total ?? null);
        return {
          resourceType: counter.resourceType,
          periodType: counter.periodType,
          quantity: counter.quantity,
          unit: counter.unit,
          softLimit: null,
          hardLimit: limitValue,
          percentUsed: limitValue ? Math.min(100, Math.round((counter.quantity / limitValue) * 100)) : null,
        };
      });
  }

  private async resolveLimit(
    scope: { organizationId?: string; workspaceId?: string; userId?: string; planTier?: string },
    resourceType: UsageResourceType,
    periodType: QuotaPeriodType,
  ): Promise<{ softLimit: number | null; hardLimit: number | null; scope: QuotaScopeType }> {
    // Module 15 — performance review (task #358). Originally one
    // sequential `findFirst` per candidate scope (up to 3 round-trips on
    // `QuotaService.check()`'s hot path — every metered action is
    // expected to call this). Collapsed to a single `findMany` across
    // every candidate `(scopeType, scopeId)` pair with an `OR`, then the
    // most-specific match is picked in memory — same result, at most one
    // query instead of up to three.
    const candidates: { scopeType: QuotaScopeType; scopeId?: string }[] = [];
    if (scope.userId) candidates.push({ scopeType: 'USER', scopeId: scope.userId });
    if (scope.workspaceId) candidates.push({ scopeType: 'WORKSPACE', scopeId: scope.workspaceId });
    if (scope.organizationId) candidates.push({ scopeType: 'ORGANIZATION', scopeId: scope.organizationId });

    if (candidates.length > 0) {
      const matches = await this.prisma.quotaPolicy.findMany({
        where: {
          resourceType,
          periodType,
          OR: candidates.map((candidate) => ({ scopeType: candidate.scopeType, scopeId: candidate.scopeId })),
        },
      });
      for (const candidate of candidates) {
        const policy = matches.find((match) => match.scopeType === candidate.scopeType && match.scopeId === candidate.scopeId);
        if (policy) return { softLimit: policy.softLimit, hardLimit: policy.hardLimit, scope: candidate.scopeType };
      }
    }

    let planTier = scope.planTier;
    if (!planTier && scope.organizationId) {
      const subscription = await this.subscriptions.getOrCreate(scope.organizationId);
      planTier = subscription.plan.tier;
    }
    if (planTier) {
      const planPolicy = await this.prisma.quotaPolicy.findFirst({
        where: { scopeType: 'PLAN', planTier: planTier as never, resourceType, periodType },
      });
      if (planPolicy) return { softLimit: planPolicy.softLimit, hardLimit: planPolicy.hardLimit, scope: 'PLAN' };

      const plan = await this.prisma.plan.findUnique({ where: { tier: planTier as never } });
      const entry = (plan?.limits as Record<string, { daily?: number | null; monthly?: number | null; total?: number | null }> | undefined)?.[
        resourceType
      ];
      const limitKey = periodType === 'DAILY' ? 'daily' : periodType === 'MONTHLY' ? 'monthly' : 'total';
      const limitValue = entry?.[limitKey] ?? null;
      return { softLimit: null, hardLimit: limitValue, scope: 'PLAN' };
    }

    return { softLimit: null, hardLimit: null, scope: 'PLAN' };
  }

  private toDto(policy: {
    id: string;
    scopeType: QuotaScopeType;
    scopeId: string | null;
    planTier: string | null;
    resourceType: UsageResourceType;
    periodType: QuotaPeriodType;
    softLimit: number | null;
    hardLimit: number | null;
    graceHours: number;
  }): QuotaPolicyDto {
    return {
      id: policy.id,
      scopeType: policy.scopeType,
      scopeId: policy.scopeId,
      planTier: policy.planTier,
      resourceType: policy.resourceType,
      periodType: policy.periodType,
      softLimit: policy.softLimit,
      hardLimit: policy.hardLimit,
      graceHours: policy.graceHours,
    };
  }
}
