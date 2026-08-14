// Module 15 — Monetization: Billing, Subscriptions, Usage Metering, Quotas.
// See docs/adr/0015-production-hardening-monetization-marketplace.md.
//
// Provider-agnostic by design: nothing here names Stripe. `BillingService`
// (apps/api/src/modules/billing) talks to whichever `PaymentProvider`
// adapter is configured (or none — `BillingProviderKind.NONE`, the
// Community Edition default) behind a shared interface.

export type PlanTier = "FREE" | "CLOUD_FREE" | "PRO" | "TEAM" | "ENTERPRISE";

export type SubscriptionStatus =
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED"
  | "EXPIRED"
  | "NONE";

export type BillingProviderKind = "STRIPE" | "MANUAL" | "NONE";

export type InvoiceStatus = "DRAFT" | "OPEN" | "PAID" | "VOID" | "UNCOLLECTIBLE";

/// `UsageResourceType` values a `Plan.limits` JSON blob may key off — kept
/// here (not duplicated) so `PlanDto.limits` and `UsageResourceType` (see
/// usage-metering.ts) stay a single source of truth for "what is a
/// meterable resource in this platform."
export interface PlanLimitEntry {
  /// `null` means unlimited — used throughout `PlanTier.FREE`'s
  /// self-hosted-usage entries, since the standing rule is "never charge
  /// users for self-hosted usage."
  daily?: number | null;
  monthly?: number | null;
  total?: number | null;
}

export interface PlanDto {
  id: string;
  tier: PlanTier;
  name: string;
  description: string;
  priceMonthlyCents: number;
  priceYearlyCents: number;
  currency: string;
  limits: Record<string, PlanLimitEntry>;
  features: Record<string, boolean | string | number>;
  isActive: boolean;
  /// Provider-specific config (e.g. Stripe price IDs) — opaque to the
  /// frontend, never rendered directly; present only so
  /// `UpgradeSubscriptionRequestDto` round-trips can confirm a plan has
  /// a real checkout path configured before showing an "Upgrade" button
  /// as clickable rather than "Contact us."
  providerMetadata: Record<string, unknown> | null;
}

export interface SubscriptionDto {
  id: string;
  organizationId: string;
  plan: PlanDto;
  status: SubscriptionStatus;
  provider: BillingProviderKind;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: string | null;
}

export interface InvoiceDto {
  id: string;
  organizationId: string;
  provider: BillingProviderKind;
  status: InvoiceStatus;
  amountCents: number;
  currency: string;
  issuedAt: string;
  paidAt: string | null;
  dueAt: string | null;
  hostedInvoiceUrl: string | null;
  pdfUrl: string | null;
}

export interface PaymentMethodDto {
  id: string;
  provider: BillingProviderKind;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  isDefault: boolean;
}

export interface UpgradeSubscriptionRequestDto {
  organizationId: string;
  planTier: PlanTier;
  /// When true and a payment provider is configured, redirects through
  /// that provider's hosted checkout instead of switching immediately —
  /// `BillingService.changePlan()` no-ops this for `BillingProviderKind.NONE`
  /// (Community Edition; a MANUAL-provider org's admin just gets switched
  /// immediately, since there's no checkout flow to redirect to).
  useHostedCheckout?: boolean;
}

export interface CancelSubscriptionRequestDto {
  organizationId: string;
  /// If true, the subscription stays active through
  /// `currentPeriodEnd` and only then reverts to `PlanTier.FREE` — if
  /// false, reverts immediately. Mirrors every mainstream SaaS's
  /// "cancel at period end" default.
  atPeriodEnd?: boolean;
}

export interface BillingCheckoutSessionDto {
  /// Null when no payment provider is configured — the caller should
  /// treat this as "plan changed immediately, no checkout needed" rather
  /// than an error.
  checkoutUrl: string | null;
  subscription: SubscriptionDto;
}

/// `BillingSummaryDto` is what `/billing` and `/settings/billing` render
/// from in one call — current plan, this period's usage against that
/// plan's limits, and payment state, so the UI doesn't need three
/// round-trips to draw one page.
export interface BillingSummaryDto {
  subscription: SubscriptionDto;
  usage: PlanUsageSummaryEntry[];
  paymentMethods: PaymentMethodDto[];
  invoices: InvoiceDto[];
}

export interface PlanUsageSummaryEntry {
  resourceType: string;
  periodType: "DAILY" | "MONTHLY" | "TOTAL";
  quantity: number;
  unit: string;
  softLimit: number | null;
  hardLimit: number | null;
  /// `null` when no limit applies (unlimited) — the UI shows "Unlimited"
  /// rather than a 0%-of-null progress bar.
  percentUsed: number | null;
}
