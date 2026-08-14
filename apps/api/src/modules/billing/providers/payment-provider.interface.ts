/// Module 15 — Monetization. Every payment-provider integration this
/// platform ever adds (Stripe today; Paddle/Lemon Squeezy/self-hosted
/// licensing/manual enterprise contracts described in the spec as future
/// work) implements this one interface — `BillingService` never imports
/// a provider SDK directly, mirroring the exact "interface first,
/// concrete binding selected by config" pattern Module 14 established
/// for `QueueService`/`CacheService`/`StorageService`
/// (`apps/api/src/common/providers/`). `PaymentProviderFactory` selects
/// the binding via `BILLING_PROVIDER`.
export interface PaymentProviderCustomer {
  providerCustomerId: string;
}

export interface PaymentProviderCheckoutSession {
  checkoutUrl: string;
  providerSessionId: string;
}

export interface PaymentProviderSubscription {
  providerSubscriptionId: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
}

export interface PaymentProviderInvoice {
  providerInvoiceId: string;
  amountCents: number;
  currency: string;
  status: 'DRAFT' | 'OPEN' | 'PAID' | 'VOID' | 'UNCOLLECTIBLE';
  issuedAt: Date;
  paidAt: Date | null;
  hostedInvoiceUrl: string | null;
  pdfUrl: string | null;
}

export interface PaymentMethodSummary {
  providerPaymentMethodId: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
}

export interface PaymentProvider {
  readonly kind: 'STRIPE' | 'MANUAL' | 'NONE';

  /// Idempotent — creates the provider-side customer for an organization
  /// the first time, returns the existing binding on every call after.
  ensureCustomer(input: {
    organizationId: string;
    name: string;
    email: string | null;
    existingProviderCustomerId: string | null;
  }): Promise<PaymentProviderCustomer>;

  /// Returns `null` when the provider has no hosted checkout concept
  /// (NONE always; MANUAL always — plan changes there are applied
  /// directly, no payment flow) — `BillingService.changePlan()` treats a
  /// `null` result as "already applied, nothing further to redirect to."
  createCheckoutSession(input: {
    providerCustomerId: string;
    planTier: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<PaymentProviderCheckoutSession | null>;

  cancelSubscription(input: {
    providerSubscriptionId: string;
    atPeriodEnd: boolean;
  }): Promise<void>;

  listInvoices(providerCustomerId: string): Promise<PaymentProviderInvoice[]>;

  listPaymentMethods(providerCustomerId: string): Promise<PaymentMethodSummary[]>;
}
