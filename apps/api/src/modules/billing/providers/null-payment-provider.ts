import { Injectable } from '@nestjs/common';
import type {
  PaymentMethodSummary,
  PaymentProvider,
  PaymentProviderCheckoutSession,
  PaymentProviderCustomer,
  PaymentProviderInvoice,
} from './payment-provider.interface.js';

/// `BILLING_PROVIDER=none` — the Community Edition default. Every method
/// is a real no-op, not a thrown "not implemented" error: `BillingService`
/// calls this exactly the same way it would call a real provider, so
/// Community Edition users see plans/quotas/usage all work normally,
/// they just never see a checkout flow or payment method (all the
/// billing UI's "no payment provider configured" states key off
/// `subscription.provider === 'NONE'`, not off catching exceptions).
@Injectable()
export class NullPaymentProvider implements PaymentProvider {
  readonly kind = 'NONE' as const;

  async ensureCustomer(): Promise<PaymentProviderCustomer> {
    return { providerCustomerId: '' };
  }

  async createCheckoutSession(): Promise<PaymentProviderCheckoutSession | null> {
    return null;
  }

  async cancelSubscription(): Promise<void> {
    // Nothing to cancel provider-side — BillingService already updated
    // the local Subscription row before calling this.
  }

  async listInvoices(): Promise<PaymentProviderInvoice[]> {
    return [];
  }

  async listPaymentMethods(): Promise<PaymentMethodSummary[]> {
    return [];
  }
}
