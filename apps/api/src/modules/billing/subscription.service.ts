import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type { BillingCheckoutSessionDto, PlanTier, SubscriptionStatus } from '@pentesthub/shared';
import { AppException } from '../../common/exceptions/app.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PAYMENT_PROVIDER } from '../../common/providers/tokens.js';
import type { PaymentProvider } from './providers/payment-provider.interface.js';
import { StripePaymentProvider } from './providers/stripe-payment-provider.js';
import { toSubscriptionDto } from './mappers/to-billing-dto.mapper.js';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/// Module 15 — Monetization (task #328). Every Organization gets exactly
/// one `Subscription` row — `getOrCreate()` is the single entry point
/// every other billing service/controller calls, so "an org with no
/// Subscription row yet" is never a state the rest of this module has to
/// special-case; it's healed lazily on first read rather than requiring
/// a hook into `CreateOrganizationHandler` (Module 10) to be edited.
@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProvider,
  ) {}

  async getOrCreate(organizationId: string) {
    const existing = await this.prisma.subscription.findUnique({
      where: { organizationId },
      include: { plan: true },
    });
    if (existing) return existing;

    const freePlan = await this.prisma.plan.findUnique({ where: { tier: 'FREE' } });
    if (!freePlan) {
      throw new AppException(
        'PLAN_NOT_FOUND',
        'The FREE plan has not been seeded — run `pnpm --filter api run seed:plans` (apps/api/prisma/seed-plans.ts) against this database.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return this.prisma.subscription.create({
      data: { organizationId, planId: freePlan.id, status: 'NONE', provider: 'NONE' },
      include: { plan: true },
    });
  }

  async getSummaryDto(organizationId: string) {
    const subscription = await this.getOrCreate(organizationId);
    return toSubscriptionDto(subscription);
  }

  /// Module 15 — task #366. Looks a `Subscription` up by the Stripe
  /// customer id embedded in a webhook payload — the only identifier a
  /// Stripe event reliably carries that this table also stores.
  findByProviderCustomerId(providerCustomerId: string) {
    return this.prisma.subscription.findFirst({ where: { providerCustomerId }, include: { plan: true } });
  }

  /// Module 15 — task #366. Reverse lookup for `Plan.providerMetadata.stripe.monthlyPriceId`
  /// — a Stripe subscription event carries a Price ID, not a `PlanTier`,
  /// so this walks the (small, operator-configured) `Plan` table to find
  /// the tier whose configured price matches. Returns `undefined` rather
  /// than throwing when no plan matches (e.g. a price created outside
  /// this deployment's configured plans, or a non-recurring add-on price)
  /// — the caller treats that as "don't change the plan on this event."
  async resolvePlanTierByStripePriceId(stripePriceId: string): Promise<PlanTier | undefined> {
    const plans = await this.prisma.plan.findMany();
    const match = plans.find((plan) => {
      const metadata = plan.providerMetadata as { stripe?: { monthlyPriceId?: string } } | null;
      return metadata?.stripe?.monthlyPriceId === stripePriceId;
    });
    return match?.tier as PlanTier | undefined;
  }

  /// Module 15 — task #366. Applies a Stripe webhook's view of
  /// subscription state onto the local `Subscription` row — called by
  /// `StripeWebhookController` after signature verification, never
  /// reachable directly. Distinct from `upgrade()`: that method is the
  /// *initiating* side (a user clicked "upgrade," this app called
  /// Stripe); this is the *confirming* side (Stripe is telling this app
  /// what actually happened — a checkout completed, a renewal succeeded,
  /// a card was declined, a subscription was canceled from Stripe's own
  /// customer portal). `planTier` is optional because not every event
  /// (e.g. a period renewal) changes which plan is active.
  async applyStripeWebhookUpdate(input: {
    providerCustomerId: string;
    providerSubscriptionId: string | null;
    status: SubscriptionStatus;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
    planTier?: PlanTier;
  }): Promise<void> {
    const subscription = await this.findByProviderCustomerId(input.providerCustomerId);
    if (!subscription) {
      this.logger.warn(
        `Stripe webhook referenced unknown providerCustomerId "${input.providerCustomerId}" — no matching Subscription row (ignored).`,
      );
      return;
    }

    let planId = subscription.planId;
    if (input.planTier) {
      const plan = await this.prisma.plan.findUnique({ where: { tier: input.planTier } });
      if (plan) planId = plan.id;
    }

    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        planId,
        status: input.status,
        provider: 'STRIPE',
        providerSubscriptionId: input.providerSubscriptionId ?? subscription.providerSubscriptionId,
        currentPeriodStart: input.currentPeriodStart ?? subscription.currentPeriodStart,
        currentPeriodEnd: input.currentPeriodEnd ?? subscription.currentPeriodEnd,
        cancelAtPeriodEnd: input.cancelAtPeriodEnd,
      },
    });
    if (input.planTier) {
      await this.syncLegacyOrganizationFields(subscription.organizationId, input.status, input.planTier);
    } else {
      // No plan change on this event (e.g. a renewal or a payment
      // failure) — sync status only, leave Organization.plan untouched
      // rather than overwriting it with an empty string.
      await this.prisma.organization
        .update({ where: { id: subscription.organizationId }, data: { subscriptionStatus: input.status.toLowerCase() } })
        .catch((error: unknown) => {
          this.logger.warn(`Failed to sync legacy Organization.subscriptionStatus for ${subscription.organizationId}: ${String(error)}`);
        });
    }
  }

  /// Community Edition path: `this.paymentProvider.kind !== 'STRIPE'`
  /// (i.e. `NONE` or `MANUAL`) switches the local `Subscription` row
  /// immediately — no checkout, no external call. The Cloud/Enterprise
  /// path (Stripe configured) requires the target `Plan.providerMetadata`
  /// to carry a resolvable Stripe Price ID; if it doesn't,
  /// `PLAN_NOT_AVAILABLE_FOR_PROVIDER` is thrown rather than silently
  /// switching the plan without ever charging for it.
  async upgrade(organizationId: string, planTier: PlanTier, useHostedCheckout = true): Promise<BillingCheckoutSessionDto> {
    const targetPlan = await this.prisma.plan.findUnique({ where: { tier: planTier } });
    if (!targetPlan) {
      throw new AppException('PLAN_NOT_FOUND', `No plan is configured for tier "${planTier}".`, HttpStatus.NOT_FOUND);
    }

    if (this.paymentProvider.kind === 'STRIPE' && useHostedCheckout && this.paymentProvider instanceof StripePaymentProvider) {
      const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
      const metadata = (targetPlan.providerMetadata as { stripe?: { monthlyPriceId?: string } } | null)?.stripe;
      if (!metadata?.monthlyPriceId) {
        throw new AppException(
          'PLAN_NOT_AVAILABLE_FOR_PROVIDER',
          `Plan "${targetPlan.name}" has no Stripe price configured (Plan.providerMetadata.stripe.monthlyPriceId) — an operator must configure one before this plan can be purchased through Stripe.`,
          HttpStatus.CONFLICT,
        );
      }
      const current = await this.getOrCreate(organizationId);
      const customer = await this.paymentProvider.ensureCustomer({
        organizationId,
        name: org.name,
        email: org.billingEmail,
        existingProviderCustomerId: current.providerCustomerId,
      });
      if (!current.providerCustomerId) {
        await this.prisma.subscription.update({
          where: { id: current.id },
          data: { providerCustomerId: customer.providerCustomerId, provider: 'STRIPE' },
        });
      }
      const session = await this.paymentProvider.createCheckoutSessionForPrice({
        providerCustomerId: customer.providerCustomerId,
        priceId: metadata.monthlyPriceId,
        successUrl: `${process.env.FRONTEND_URL ?? ''}/billing?checkout=success`,
        cancelUrl: `${process.env.FRONTEND_URL ?? ''}/billing?checkout=cancelled`,
      });
      const subscription = await this.prisma.subscription.findUniqueOrThrow({
        where: { organizationId },
        include: { plan: true },
      });
      return { checkoutUrl: session.checkoutUrl, subscription: toSubscriptionDto(subscription) };
    }

    // NONE / MANUAL — apply immediately, no external checkout.
    const now = new Date();
    const subscription = await this.prisma.subscription.update({
      where: { organizationId },
      data: {
        planId: targetPlan.id,
        status: 'ACTIVE',
        provider: this.paymentProvider.kind,
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + THIRTY_DAYS_MS),
        cancelAtPeriodEnd: false,
      },
      include: { plan: true },
    });
    await this.syncLegacyOrganizationFields(organizationId, subscription.status, targetPlan.tier);
    return { checkoutUrl: null, subscription: toSubscriptionDto(subscription) };
  }

  async cancel(organizationId: string, atPeriodEnd = true) {
    const subscription = await this.prisma.subscription.findUnique({ where: { organizationId }, include: { plan: true } });
    if (!subscription) {
      throw new AppException('SUBSCRIPTION_NOT_FOUND', 'No subscription exists for this organization.', HttpStatus.NOT_FOUND);
    }

    if (subscription.provider === 'STRIPE' && subscription.providerSubscriptionId) {
      await this.paymentProvider.cancelSubscription({
        providerSubscriptionId: subscription.providerSubscriptionId,
        atPeriodEnd,
      });
    }

    if (atPeriodEnd) {
      const updated = await this.prisma.subscription.update({
        where: { organizationId },
        data: { cancelAtPeriodEnd: true },
        include: { plan: true },
      });
      return toSubscriptionDto(updated);
    }

    const freePlan = await this.prisma.plan.findUniqueOrThrow({ where: { tier: 'FREE' } });
    const updated = await this.prisma.subscription.update({
      where: { organizationId },
      data: { planId: freePlan.id, status: 'CANCELED', cancelAtPeriodEnd: false },
      include: { plan: true },
    });
    await this.syncLegacyOrganizationFields(organizationId, 'CANCELED', 'FREE');
    return toSubscriptionDto(updated);
  }

  async renew(organizationId: string) {
    const subscription = await this.prisma.subscription.findUnique({ where: { organizationId }, include: { plan: true } });
    if (!subscription) {
      throw new AppException('SUBSCRIPTION_NOT_FOUND', 'No subscription exists for this organization.', HttpStatus.NOT_FOUND);
    }
    const base = subscription.currentPeriodEnd && subscription.currentPeriodEnd > new Date() ? subscription.currentPeriodEnd : new Date();
    const updated = await this.prisma.subscription.update({
      where: { organizationId },
      data: {
        status: 'ACTIVE',
        cancelAtPeriodEnd: false,
        currentPeriodStart: subscription.currentPeriodStart ?? new Date(),
        currentPeriodEnd: new Date(base.getTime() + THIRTY_DAYS_MS),
      },
      include: { plan: true },
    });
    return toSubscriptionDto(updated);
  }

  /// `Organization.plan`/`subscriptionStatus` (Module 14, plain strings)
  /// are kept in sync as a denormalized read convenience for any
  /// pre-Module-15 code that still reads them directly — see the
  /// `Subscription` model's doc comment in schema.prisma for why both
  /// exist rather than migrating the legacy columns away outright.
  private async syncLegacyOrganizationFields(organizationId: string, status: string, tier: string): Promise<void> {
    await this.prisma.organization
      .update({
        where: { id: organizationId },
        data: { plan: tier.toLowerCase(), subscriptionStatus: status.toLowerCase() },
      })
      .catch((error: unknown) => {
        this.logger.warn(`Failed to sync legacy Organization.plan/subscriptionStatus for ${organizationId}: ${String(error)}`);
      });
  }
}
