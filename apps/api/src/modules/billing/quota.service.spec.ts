import { describe, expect, it, jest } from '@jest/globals';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { UsageService } from './usage.service.js';
import type { SubscriptionService } from './subscription.service.js';
import { QuotaService } from './quota.service.js';

/// Module 15 — task #330/#358/#362. Sandbox disclosure: `jest` cannot run
/// here — see `feature-flags.service.spec.ts`'s doc comment. This
/// specifically exercises the N+1 fix made in task #358's performance
/// review: `resolveLimit()` now issues one `findMany` across every
/// candidate scope instead of up to three sequential `findFirst` calls.
function buildService(opts: { policies: { scopeType: string; scopeId: string | null; softLimit: number | null; hardLimit: number | null }[]; counterQuantity?: number }) {
  const findMany = jest.fn(async () => opts.policies);
  const prisma: Partial<PrismaService> = {
    quotaPolicy: { findMany, findFirst: jest.fn() } as never,
  };
  const usage: Partial<UsageService> = { getCounter: jest.fn(async () => ({ quantity: opts.counterQuantity ?? 0 })) as never };
  const subscriptions: Partial<SubscriptionService> = {};
  const service = new QuotaService(prisma as PrismaService, usage as UsageService, subscriptions as SubscriptionService);
  return { service, findMany };
}

describe('QuotaService.check / resolveLimit', () => {
  it('issues exactly one findMany call to resolve a USER+WORKSPACE+ORGANIZATION candidate set', async () => {
    const { service, findMany } = buildService({ policies: [] });
    await service.check({ userId: 'u1', workspaceId: 'w1', organizationId: 'o1' }, 'AI_TOKENS');
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('picks the most specific match (USER over WORKSPACE over ORGANIZATION) from the single query result', async () => {
    const { service } = buildService({
      policies: [
        { scopeType: 'ORGANIZATION', scopeId: 'o1', softLimit: null, hardLimit: 1000 },
        { scopeType: 'USER', scopeId: 'u1', softLimit: null, hardLimit: 5 },
      ],
      counterQuantity: 10,
    });
    const result = await service.check({ userId: 'u1', workspaceId: 'w1', organizationId: 'o1' }, 'AI_TOKENS');
    expect(result.appliedScope).toBe('USER');
    expect(result.hardLimit).toBe(5);
    expect(result.blocked).toBe(true); // 10 >= 5
  });

  it('allows unlimited usage when no policy exists at any scope and no plan-tier fallback is given', async () => {
    const { service } = buildService({ policies: [] });
    const result = await service.check({ userId: 'u1' }, 'AI_TOKENS');
    expect(result.allowed).toBe(true);
    expect(result.blocked).toBe(false);
    expect(result.hardLimit).toBeNull();
  });
});
