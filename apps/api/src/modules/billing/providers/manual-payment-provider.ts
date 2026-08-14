import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  PaymentMethodSummary,
  PaymentProvider,
  PaymentProviderCheckoutSession,
  PaymentProviderCustomer,
  PaymentProviderInvoice,
} from './payment-provider.interface.js';

/// `BILLING_PROVIDER=manual` — for enterprise customers on a negotiated
/// contract with no self-serve payment flow (a wire transfer, a PO, an
/// annual invoice sent by a human). `ensureCustomer` mints a stable
/// internal ID (never calls out anywhere); invoices and payment methods
/// come from `Invoice`/`PaymentMethod` rows an operator enters directly
/// via `InvoiceService`/`BillingController`'s admin endpoints, not from
/// this provider — so both list methods intentionally return `[]` here
/// (the source of truth is the database, not a provider round-trip).
@Injectable()
export class ManualPaymentProvider implements PaymentProvider {
  readonly kind = 'MANUAL' as const;

  async ensureCustomer(input: {
    existingProviderCustomerId: string | null;
  }): Promise<PaymentProviderCustomer> {
    return { providerCustomerId: input.existingProviderCustomerId ?? `manual_${randomUUID()}` };
  }

  async createCheckoutSession(): Promise<PaymentProviderCheckoutSession | null> {
    return null;
  }

  async cancelSubscription(): Promise<void> {
    // Manual contracts are cancelled by an operator updating the
    // Subscription row directly; nothing to call out to here.
  }

  async listInvoices(): Promise<PaymentProviderInvoice[]> {
    return [];
  }

  async listPaymentMethods(): Promise<PaymentMethodSummary[]> {
    return [];
  }
}
