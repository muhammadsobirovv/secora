import type {
  InvoiceDto,
  PaymentMethodDto,
  PlanDto,
  SubscriptionDto,
} from '@pentesthub/shared';
import type { Invoice, PaymentMethod, Plan, Subscription } from '../../../prisma-types.js';

export function toPlanDto(plan: Plan): PlanDto {
  return {
    id: plan.id,
    tier: plan.tier,
    name: plan.name,
    description: plan.description,
    priceMonthlyCents: plan.priceMonthlyCents,
    priceYearlyCents: plan.priceYearlyCents,
    currency: plan.currency,
    limits: plan.limits as PlanDto['limits'],
    features: plan.features as PlanDto['features'],
    isActive: plan.isActive,
    providerMetadata: (plan.providerMetadata as PlanDto['providerMetadata']) ?? null,
  };
}

export function toSubscriptionDto(subscription: Subscription & { plan: Plan }): SubscriptionDto {
  return {
    id: subscription.id,
    organizationId: subscription.organizationId,
    plan: toPlanDto(subscription.plan),
    status: subscription.status,
    provider: subscription.provider,
    currentPeriodStart: subscription.currentPeriodStart ? subscription.currentPeriodStart.toISOString() : null,
    currentPeriodEnd: subscription.currentPeriodEnd ? subscription.currentPeriodEnd.toISOString() : null,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    trialEndsAt: subscription.trialEndsAt ? subscription.trialEndsAt.toISOString() : null,
  };
}

export function toInvoiceDto(invoice: Invoice): InvoiceDto {
  return {
    id: invoice.id,
    organizationId: invoice.organizationId,
    provider: invoice.provider,
    status: invoice.status,
    amountCents: invoice.amountCents,
    currency: invoice.currency,
    issuedAt: invoice.issuedAt.toISOString(),
    paidAt: invoice.paidAt ? invoice.paidAt.toISOString() : null,
    dueAt: invoice.dueAt ? invoice.dueAt.toISOString() : null,
    hostedInvoiceUrl: invoice.hostedInvoiceUrl,
    pdfUrl: invoice.pdfUrl,
  };
}

export function toPaymentMethodDto(pm: PaymentMethod): PaymentMethodDto {
  return {
    id: pm.id,
    provider: pm.provider,
    brand: pm.brand,
    last4: pm.last4,
    expMonth: pm.expMonth,
    expYear: pm.expYear,
    isDefault: pm.isDefault,
  };
}
