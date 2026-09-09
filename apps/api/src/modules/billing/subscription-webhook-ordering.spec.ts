import { describe, expect, it, jest } from '@jest/globals';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { PaymentProvider } from './providers/payment-provider.interface.js';
import { SubscriptionService } from './subscription.service.js';

/// Module 20 — Phase 7 webhook event-ordering fix regression test.
/// Sandbox disclosure: `jest` cannot run here (the binary's target file
/// is missing from this sandbox's partial pnpm install — see
/// `docs/reviews/0024-module-20-backlog-reconciliation.md`'s Verification
/// section). Written and manually traced against
/// `SubscriptionService.applyStripeWebhookUpdate()`'s actual
/// implementation; must be executed on a normal machine before this
/// module ships.
function buildService(opts: { lastWebhookEventAt: Date | null; updateManyCount: number }) {
  const updateMany = jest.fn(async () => ({ count: opts.updateManyCount }));
  const subscription = {
    id: 'sub-row-1',
    organizationId: 'org-1',
    planId: 'plan-free',
    providerCustomerId: 'cus_123',
    providerSubscriptionId: 'sub_123',
    lastWebhookEventAt: opts.lastWebhookEventAt,
  };
  const prisma: Partial<PrismaService> = {
    subscription: {
      findFirst: jest.fn(async () => subscription),
      updateMany,
    } as never,
    plan: { findUnique: jest.fn(async () => null) } as never,
    organization: { update: jest.fn(async () => undefined) } as never,
  };
  const paymentProvider: Partial<PaymentProvider> = {};
  const service = new SubscriptionService(prisma as PrismaService, paymentProvider as PaymentProvider);
  return { service, updateMany, subscription };
}

describe('SubscriptionService.applyStripeWebhookUpdate — event ordering', () => {
  it('applies an event newer than the last-applied one and stamps lastWebhookEventId/At', async () => {
    const { service, updateMany } = buildService({
      lastWebhookEventAt: new Date('2026-01-01T00:00:00Z'),
      updateManyCount: 1,
    });

    await service.applyStripeWebhookUpdate({
      providerCustomerId: 'cus_123',
      providerSubscriptionId: 'sub_123',
      status: 'ACTIVE',
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      eventId: 'evt_new',
      eventCreatedAt: new Date('2026-01-02T00:00:00Z'),
    });

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastWebhookEventId: 'evt_new', lastWebhookEventAt: new Date('2026-01-02T00:00:00Z') }),
      }),
    );
  });

  it('skips an out-of-order event whose updateMany matches zero rows, without throwing', async () => {
    const { service, updateMany } = buildService({
      lastWebhookEventAt: new Date('2026-01-02T00:00:00Z'),
      updateManyCount: 0, // simulates the WHERE clause excluding this row (stale event)
    });

    await expect(
      service.applyStripeWebhookUpdate({
        providerCustomerId: 'cus_123',
        providerSubscriptionId: 'sub_123',
        status: 'PAST_DUE',
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        eventId: 'evt_stale',
        eventCreatedAt: new Date('2026-01-01T00:00:00Z'), // older than lastWebhookEventAt
      }),
    ).resolves.toBeUndefined();

    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  it('always applies when the subscription has never received a webhook before (lastWebhookEventAt is null)', async () => {
    const { service, updateMany } = buildService({ lastWebhookEventAt: null, updateManyCount: 1 });

    await service.applyStripeWebhookUpdate({
      providerCustomerId: 'cus_123',
      providerSubscriptionId: 'sub_123',
      status: 'ACTIVE',
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      eventId: 'evt_first',
      eventCreatedAt: new Date('2020-01-01T00:00:00Z'), // arbitrarily "old" wall-clock time, still the first event
    });

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ lastWebhookEventAt: null }, { lastWebhookEventAt: { lte: new Date('2020-01-01T00:00:00Z') } }],
        }),
      }),
    );
  });
});
