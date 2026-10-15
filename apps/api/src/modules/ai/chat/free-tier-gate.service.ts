import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AiProviderName } from '@pentesthub/shared';
import type { EnvConfig } from '../../../config/env.validation.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { SubscriptionService } from '../../billing/subscription.service.js';
import { UsageService } from '../../billing/usage.service.js';
import { AiProviderRegistryService } from '../providers/ai-provider-registry.service.js';
import {
  FREE_TIER_MAX_PROMPT_TOKENS,
  FREE_TIER_MODEL,
  freeTierDailyLimitPerUser,
} from './free-tier-policy.js';

const PROVIDERS: AiProviderName[] = [
  'OPENAI',
  'ANTHROPIC',
  'GEMINI',
  'OLLAMA',
  'OPENROUTER',
];
const USER_COUNT_CACHE_MS = 10 * 60 * 1000;

export interface FreeTierDecision {
  model: string;
  dailyLimit: number;
  used: number;
}

/// Decides whether a chat turn runs on the hosted free tier (server Gemini
/// key + Gemma model + per-user daily cap). Only applies when
/// AI_HOSTED_FREE_TIER is enabled, the workspace's organization is on the
/// FREE plan, and the workspace has no BYOK credential of its own.
/// Anything else returns null and the normal provider resolution runs.
@Injectable()
export class FreeTierGateService {
  private userCountCache: { value: number; at: number } | null = null;

  constructor(
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionService,
    private readonly usage: UsageService,
    private readonly providerRegistry: AiProviderRegistryService,
  ) {}

  async evaluate(
    workspaceId: string,
    userId: string,
  ): Promise<FreeTierDecision | null> {
    if (!this.configService.get('AI_HOSTED_FREE_TIER', { infer: true }))
      return null;

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { organizationId: true },
    });
    const organizationId = workspace?.organizationId ?? null;
    if (organizationId) {
      const subscription = await this.subscriptions.getOrCreate(organizationId);
      if (subscription.plan.tier !== 'FREE') return null;
    }

    for (const provider of PROVIDERS) {
      if (await this.providerRegistry.resolveCredential(provider, workspaceId))
        return null;
    }

    const dailyLimit = freeTierDailyLimitPerUser(await this.activeUserCount());
    const counter = await this.usage.getCounter(
      { organizationId: organizationId ?? undefined, workspaceId, userId },
      'AI_REQUESTS',
      'DAILY',
    );
    const used = counter?.quantity ?? 0;

    if (used >= dailyLimit) {
      throw new AppException(
        'AI_FREE_TIER_LIMIT_REACHED',
        `Bugungi bepul AI limiti (${dailyLimit} ta so'rov) tugadi. O'z AI kalitingizni ulang yoki Pro tarifga o'ting.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return { model: FREE_TIER_MODEL, dailyLimit, used };
  }

  /// Drops the oldest history messages until the rough token estimate fits
  /// Gemma's 16K TPM budget. Keeps the system messages and the latest turn.
  trimForFreeTier<T extends { content: string }>(messages: T[]): T[] {
    const estimate = (m: T) => Math.ceil(m.content.length / 4);
    let total = messages.reduce((sum, m) => sum + estimate(m), 0);
    const trimmed = [...messages];
    while (total > FREE_TIER_MAX_PROMPT_TOKENS && trimmed.length > 2) {
      const index = trimmed.findIndex(
        (m, i) => i < trimmed.length - 1 && !isSystemLike(m),
      );
      if (index === -1) break;
      total -= estimate(trimmed[index]);
      trimmed.splice(index, 1);
    }
    return trimmed;
  }

  /// Approximate total registered users, cached for 10 minutes. Counting all
  /// users (not only free ones) keeps the per-user limit on the safe side.
  private async activeUserCount(): Promise<number> {
    const now = Date.now();
    if (
      this.userCountCache &&
      now - this.userCountCache.at < USER_COUNT_CACHE_MS
    ) {
      return this.userCountCache.value;
    }
    const value = await this.prisma.user.count();
    this.userCountCache = { value, at: now };
    return value;
  }
}

function isSystemLike(message: { content: string }): boolean {
  return (message as { role?: string }).role === 'system';
}
