import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../../config/env.validation.js';
import type {
  PaymentMethodSummary,
  PaymentProvider,
  PaymentProviderCheckoutSession,
  PaymentProviderCustomer,
  PaymentProviderInvoice,
} from './payment-provider.interface.js';

/// `BILLING_PROVIDER=stripe`. Deliberately calls Stripe's REST API
/// directly via `fetch` (Stripe's API is plain HTTPS + form-encoded
/// bodies, documented and stable) instead of adding the `stripe` npm
/// package as a project dependency — keeps this adapter's existence from
/// forcing a `pnpm install` of a payment SDK onto every Community
/// Edition deployment that never sets `BILLING_PROVIDER=stripe` at all,
/// consistent with `packages/cli`'s established "zero unnecessary
/// runtime dependencies" precedent (Module 13). If a project maintainer
/// later wants webhook-signature verification's timing-safe HMAC
/// comparison or richer typed responses, swapping this file's internals
/// for the official SDK is a contained, single-file change — nothing
/// outside this class imports Stripe-specific types.
@Injectable()
export class StripePaymentProvider implements PaymentProvider {
  readonly kind = 'STRIPE' as const;
  private readonly logger = new Logger(StripePaymentProvider.name);
  private readonly apiBase = 'https://api.stripe.com/v1';
  private readonly secretKey: string;

  constructor(configService: ConfigService<EnvConfig, true>) {
    this.secretKey = configService.get('STRIPE_SECRET_KEY', { infer: true }) ?? '';
    if (!this.secretKey) {
      this.logger.warn(
        'BILLING_PROVIDER=stripe but STRIPE_SECRET_KEY is unset — every Stripe call will fail. ' +
          'Set STRIPE_SECRET_KEY, or leave BILLING_PROVIDER unset/none for Community Edition use.',
      );
    }
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: Record<string, string>): Promise<T> {
    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
    };
    if (body) init.body = new URLSearchParams(body).toString();
    const response = await fetch(`${this.apiBase}${path}`, init);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Stripe API error (${response.status}) on ${method} ${path}: ${text}`);
    }
    return (await response.json()) as T;
  }

  async ensureCustomer(input: {
    organizationId: string;
    name: string;
    email: string | null;
    existingProviderCustomerId: string | null;
  }): Promise<PaymentProviderCustomer> {
    if (input.existingProviderCustomerId) {
      return { providerCustomerId: input.existingProviderCustomerId };
    }
    const customer = await this.request<{ id: string }>('POST', '/customers', {
      name: input.name,
      ...(input.email ? { email: input.email } : {}),
      'metadata[organizationId]': input.organizationId,
    });
    return { providerCustomerId: customer.id };
  }

  async createCheckoutSession(input: {
    providerCustomerId: string;
    planTier: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<PaymentProviderCheckoutSession | null> {
    // The caller (SubscriptionService) is responsible for resolving
    // `input.planTier` to a Stripe Price ID via `Plan.providerMetadata`
    // and passing it through — this method signature stays generic so
    // the interface doesn't leak a Stripe-specific "price ID" concept.
    // If no price is configured for this plan/provider pair, the caller
    // never invokes this method at all (see SubscriptionService.upgrade()).
    throw new Error(
      'StripePaymentProvider.createCheckoutSession must be called via ' +
        'SubscriptionService.upgrade(), which resolves the Stripe Price ID first.',
    );
  }

  async createCheckoutSessionForPrice(input: {
    providerCustomerId: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<PaymentProviderCheckoutSession> {
    const session = await this.request<{ id: string; url: string }>('POST', '/checkout/sessions', {
      customer: input.providerCustomerId,
      mode: 'subscription',
      'line_items[0][price]': input.priceId,
      'line_items[0][quantity]': '1',
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    });
    return { checkoutUrl: session.url, providerSessionId: session.id };
  }

  async cancelSubscription(input: { providerSubscriptionId: string; atPeriodEnd: boolean }): Promise<void> {
    if (input.atPeriodEnd) {
      await this.request('POST', `/subscriptions/${input.providerSubscriptionId}`, {
        cancel_at_period_end: 'true',
      });
    } else {
      await this.request('POST', `/subscriptions/${input.providerSubscriptionId}`, { cancel_at_period_end: 'false' });
      await this.request('POST', `/subscriptions/${input.providerSubscriptionId}/cancel`);
    }
  }

  async listInvoices(providerCustomerId: string): Promise<PaymentProviderInvoice[]> {
    const result = await this.request<{
      data: {
        id: string;
        amount_due: number;
        currency: string;
        status: string;
        created: number;
        status_transitions: { paid_at: number | null };
        hosted_invoice_url: string | null;
        invoice_pdf: string | null;
      }[];
    }>('GET', `/invoices?customer=${encodeURIComponent(providerCustomerId)}&limit=100`);
    return result.data.map((invoice) => ({
      providerInvoiceId: invoice.id,
      amountCents: invoice.amount_due,
      currency: invoice.currency,
      status: this.mapInvoiceStatus(invoice.status),
      issuedAt: new Date(invoice.created * 1000),
      paidAt: invoice.status_transitions.paid_at ? new Date(invoice.status_transitions.paid_at * 1000) : null,
      hostedInvoiceUrl: invoice.hosted_invoice_url,
      pdfUrl: invoice.invoice_pdf,
    }));
  }

  async listPaymentMethods(providerCustomerId: string): Promise<PaymentMethodSummary[]> {
    const result = await this.request<{
      data: { id: string; card?: { brand: string; last4: string; exp_month: number; exp_year: number } }[];
    }>('GET', `/payment_methods?customer=${encodeURIComponent(providerCustomerId)}&type=card`);
    return result.data.map((pm) => ({
      providerPaymentMethodId: pm.id,
      brand: pm.card?.brand ?? null,
      last4: pm.card?.last4 ?? null,
      expMonth: pm.card?.exp_month ?? null,
      expYear: pm.card?.exp_year ?? null,
    }));
  }

  private mapInvoiceStatus(stripeStatus: string): PaymentProviderInvoice['status'] {
    switch (stripeStatus) {
      case 'paid':
        return 'PAID';
      case 'open':
        return 'OPEN';
      case 'void':
        return 'VOID';
      case 'uncollectible':
        return 'UNCOLLECTIBLE';
      default:
        return 'DRAFT';
    }
  }
}
