import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { AiBudgetCheckResultDto, AiProviderName, CreateAiBudgetPolicyRequestDto, AiBudgetPolicyDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { UsageService } from '../usage.service.js';
import { SubscriptionService } from '../subscription.service.js';
import { AiModelPricingService } from './ai-model-pricing.service.js';
import { NotificationDispatcherService } from '../../notifications-channels/services/notification-dispatcher.service.js';

const ALERT_DEDUPE_WINDOW_MS = 60 * 60 * 1000;

/// Module 15 — AI cost control (task #340). The synchronous, pre-call
/// counterpart to `QuotaService` — see `AiBudgetPolicy`'s doc comment in
/// schema.prisma for why this is a separate table/service rather than a
/// `QuotaPolicy` variant. `check()` is meant to be called from
/// `AiChatService.runGeneration()` (and equivalent Agent SDK / Script
/// Engine `ai.invoke` call sites, not yet wired — disclosed follow-up)
/// right after provider/model resolution and before the first token is
/// streamed; `recordUsage()` is meant to be called right after a
/// generation completes and real token counts are known.
///
/// Scope resolution mirrors `QuotaService.resolveLimit()`: USER ->
/// WORKSPACE -> ORGANIZATION -> PLAN, most-specific-explicit-row-wins,
/// falling back to a PLAN-tier-scoped `AiBudgetPolicy` (not `Plan.limits`
/// — budgets are their own concept, not a `UsageResourceType` limit) and
/// finally to "no policy at any level" = unlimited, the same
/// zero-configuration Community Edition default every other Module 15
/// enforcement mechanism has.
@Injectable()
export class AiBudgetEnforcerService {
  private readonly logger = new Logger(AiBudgetEnforcerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usage: UsageService,
    private readonly subscriptions: SubscriptionService,
    private readonly pricing: AiModelPricingService,
    private readonly notificationDispatcher: NotificationDispatcherService,
  ) {}

  async createPolicy(input: CreateAiBudgetPolicyRequestDto): Promise<AiBudgetPolicyDto> {
    // Same "findFirst + create/update, not .upsert()" reasoning as
    // QuotaService.createPolicy — scopeId/planTier are both nullable and
    // Postgres NULL-distinctness would break a compound-key upsert.
    const existing = await this.prisma.aiBudgetPolicy.findFirst({
      where: {
        scopeType: input.scopeType,
        scopeId: input.scopeId ?? null,
        planTier: (input.planTier as never) ?? null,
      },
    });
    const data = {
      dailyTokenLimit: input.dailyTokenLimit ?? null,
      monthlyTokenLimit: input.monthlyTokenLimit ?? null,
      dailyCostCentsLimit: input.dailyCostCentsLimit ?? null,
      monthlyCostCentsLimit: input.monthlyCostCentsLimit ?? null,
      hardStop: input.hardStop ?? false,
    };
    const policy = existing
      ? await this.prisma.aiBudgetPolicy.update({ where: { id: existing.id }, data })
      : await this.prisma.aiBudgetPolicy.create({
          data: {
            scopeType: input.scopeType,
            scopeId: input.scopeId ?? null,
            planTier: input.planTier as never,
            ...data,
          },
        });
    return this.toDto(policy);
  }

  async listPolicies(): Promise<AiBudgetPolicyDto[]> {
    const policies = await this.prisma.aiBudgetPolicy.findMany();
    return policies.map((policy) => this.toDto(policy));
  }

  async deletePolicy(id: string): Promise<void> {
    const policy = await this.prisma.aiBudgetPolicy.findUnique({ where: { id } });
    if (!policy) {
      throw new AppException('AI_BUDGET_POLICY_NOT_FOUND', `No AI budget policy with id "${id}".`, HttpStatus.NOT_FOUND);
    }
    await this.prisma.aiBudgetPolicy.delete({ where: { id } });
  }

  /// `provider`/`model` are the ones the caller is about to use — needed
  /// only to populate `fallbackSuggested`, not to look up the policy
  /// itself (policies aren't per-model).
  async check(workspaceId: string, userId: string, provider: AiProviderName, model: string): Promise<AiBudgetCheckResultDto> {
    const scope = await this.resolveScope(workspaceId);
    const resolved = await this.resolvePolicy(workspaceId, userId, scope);

    if (!resolved) {
      return {
        allowed: true,
        hardStopped: false,
        warning: false,
        remainingDailyTokens: null,
        remainingMonthlyTokens: null,
        fallbackSuggested: null,
      };
    }

    const usageScope = { organizationId: scope.organizationId, workspaceId, userId };
    const [dailyTokens, monthlyTokens, dailyCostCents, monthlyCostCents] = await Promise.all([
      this.usage.getCounter(usageScope, 'AI_TOKENS', 'DAILY'),
      this.usage.getCounter(usageScope, 'AI_TOKENS', 'MONTHLY'),
      this.usage.getCounter(usageScope, 'AI_COST_CENTS', 'DAILY'),
      this.usage.getCounter(usageScope, 'AI_COST_CENTS', 'MONTHLY'),
    ]);
    const dailyTokenQty = dailyTokens?.quantity ?? 0;
    const monthlyTokenQty = monthlyTokens?.quantity ?? 0;
    const dailyCostQty = dailyCostCents?.quantity ?? 0;
    const monthlyCostQty = monthlyCostCents?.quantity ?? 0;

    const overAny =
      (resolved.dailyTokenLimit != null && dailyTokenQty >= resolved.dailyTokenLimit) ||
      (resolved.monthlyTokenLimit != null && monthlyTokenQty >= resolved.monthlyTokenLimit) ||
      (resolved.dailyCostCentsLimit != null && dailyCostQty >= resolved.dailyCostCentsLimit) ||
      (resolved.monthlyCostCentsLimit != null && monthlyCostQty >= resolved.monthlyCostCentsLimit);

    const hardStopped = overAny && resolved.hardStop;
    const warning = overAny && !resolved.hardStop;

    let fallbackSuggested: { provider: string; model: string } | null = null;
    if (overAny) {
      fallbackSuggested = await this.pricing.findCheaperAlternative(provider, model);
    }

    const result: AiBudgetCheckResultDto = {
      allowed: !hardStopped,
      hardStopped,
      warning,
      remainingDailyTokens: resolved.dailyTokenLimit != null ? Math.max(0, resolved.dailyTokenLimit - dailyTokenQty) : null,
      remainingMonthlyTokens: resolved.monthlyTokenLimit != null ? Math.max(0, resolved.monthlyTokenLimit - monthlyTokenQty) : null,
      fallbackSuggested,
    };

    if (overAny) {
      await this.maybeAlert(workspaceId, userId, result);
    }
    if (hardStopped) {
      throw new AppException(
        'AI_BUDGET_EXCEEDED',
        'This workspace has reached its configured AI budget limit and AiBudgetPolicy.hardStop is enabled.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return result;
  }

  /// Called after a generation completes with real token counts — never
  /// before, since actual usage (not an estimate) is what both the
  /// budget ledger and the billing usage bars should reflect. Failure
  /// here is logged, not thrown — a metering write failing must never
  /// undo an AI response the user already received, the same posture
  /// `WebhookDispatchHandler`/`ActivityRecordingHandler` take on their
  /// own best-effort side-effect writes.
  async recordUsage(
    workspaceId: string,
    userId: string,
    provider: AiProviderName,
    model: string,
    promptTokens: number,
    completionTokens: number,
  ): Promise<void> {
    try {
      const scope = await this.resolveScope(workspaceId);
      const { estimatedCostCents } = await this.pricing.estimateCostCents({
        provider,
        model,
        estimatedInputTokens: promptTokens,
        estimatedOutputTokens: completionTokens,
      });
      const usageScope = { organizationId: scope.organizationId ?? undefined, workspaceId, userId };
      await Promise.all([
        this.usage.record({ ...usageScope, resourceType: 'AI_TOKENS', quantity: promptTokens + completionTokens, unit: 'tokens' }),
        this.usage.record({ ...usageScope, resourceType: 'AI_REQUESTS', quantity: 1, unit: 'requests' }),
        this.usage.record({ ...usageScope, resourceType: 'AI_COST_CENTS', quantity: estimatedCostCents, unit: 'cents' }),
      ]);
    } catch (error) {
      this.logger.error(
        `Failed to record AI usage for workspace ${workspaceId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async resolveScope(workspaceId: string): Promise<{ organizationId: string | null; planTier: string | null }> {
    const workspace = await this.prisma.workspace.findUnique({ where: { id: workspaceId }, select: { organizationId: true } });
    const organizationId = workspace?.organizationId ?? null;
    let planTier: string | null = null;
    if (organizationId) {
      const subscription = await this.subscriptions.getOrCreate(organizationId);
      planTier = subscription.plan.tier;
    }
    return { organizationId, planTier };
  }

  /// USER -> WORKSPACE -> ORGANIZATION -> PLAN — same most-specific-wins
  /// order as QuotaService.resolveLimit(), just against AiBudgetPolicy
  /// instead of QuotaPolicy.
  private async resolvePolicy(
    workspaceId: string,
    userId: string,
    scope: { organizationId: string | null; planTier: string | null },
  ): Promise<{
    dailyTokenLimit: number | null;
    monthlyTokenLimit: number | null;
    dailyCostCentsLimit: number | null;
    monthlyCostCentsLimit: number | null;
    hardStop: boolean;
  } | null> {
    const candidates: { scopeType: 'USER' | 'WORKSPACE' | 'ORGANIZATION'; scopeId: string }[] = [
      { scopeType: 'USER', scopeId: userId },
      { scopeType: 'WORKSPACE', scopeId: workspaceId },
    ];
    if (scope.organizationId) candidates.push({ scopeType: 'ORGANIZATION', scopeId: scope.organizationId });

    for (const candidate of candidates) {
      const policy = await this.prisma.aiBudgetPolicy.findFirst({
        where: { scopeType: candidate.scopeType, scopeId: candidate.scopeId },
      });
      if (policy) return policy;
    }
    if (scope.planTier) {
      const planPolicy = await this.prisma.aiBudgetPolicy.findFirst({
        where: { scopeType: 'PLAN', planTier: scope.planTier as never },
      });
      if (planPolicy) return planPolicy;
    }
    return null;
  }

  /// Best-effort, deduped to at most one AI_BUDGET_ALERT notification per
  /// workspace per hour — a hard-stopped budget would otherwise raise a
  /// new notification on literally every subsequent chat turn a user
  /// tries (and fails) to send.
  private async maybeAlert(workspaceId: string, userId: string, result: AiBudgetCheckResultDto): Promise<void> {
    try {
      const recent = await this.prisma.bugBountyNotification.findFirst({
        where: {
          workspaceId,
          type: 'AI_BUDGET_ALERT',
          createdAt: { gte: new Date(Date.now() - ALERT_DEDUPE_WINDOW_MS) },
        },
      });
      if (recent) return;

      const title = result.hardStopped ? 'AI budget limit reached' : 'AI budget warning';
      const body = result.hardStopped
        ? 'This workspace has reached its configured AI budget limit. AI chat is blocked until the next period or the policy is raised.'
        : 'This workspace is approaching its configured AI budget limit.';
      const notification = await this.prisma.bugBountyNotification.create({
        data: { workspaceId, userId, type: 'AI_BUDGET_ALERT', title, body },
      });
      await this.notificationDispatcher.dispatch(notification.id, workspaceId, userId, title, body);
    } catch (error) {
      this.logger.error(
        `Failed to raise AI budget alert for workspace ${workspaceId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private toDto(policy: {
    id: string;
    scopeType: string;
    scopeId: string | null;
    planTier: string | null;
    dailyTokenLimit: number | null;
    monthlyTokenLimit: number | null;
    dailyCostCentsLimit: number | null;
    monthlyCostCentsLimit: number | null;
    hardStop: boolean;
  }): AiBudgetPolicyDto {
    return {
      id: policy.id,
      scopeType: policy.scopeType as AiBudgetPolicyDto['scopeType'],
      scopeId: policy.scopeId,
      planTier: policy.planTier,
      dailyTokenLimit: policy.dailyTokenLimit,
      monthlyTokenLimit: policy.monthlyTokenLimit,
      dailyCostCentsLimit: policy.dailyCostCentsLimit,
      monthlyCostCentsLimit: policy.monthlyCostCentsLimit,
      hardStop: policy.hardStop,
    };
  }
}
