import { Injectable } from '@nestjs/common';
import type { BillingSummaryDto, PlanDto } from '@pentesthub/shared';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SubscriptionService } from './subscription.service.js';
import { InvoiceService } from './invoice.service.js';
import { QuotaService } from './quota.service.js';
import { toPlanDto } from './mappers/to-billing-dto.mapper.js';

/// Module 15 — BillingService (task #327). The one façade
/// `BillingController` calls — composes `SubscriptionService`/
/// `InvoiceService`/`QuotaService` into the single `BillingSummaryDto`
/// `/billing` and `/settings/billing` render from, so the frontend needs
/// exactly one round-trip to draw the whole page.
///
/// Module 19 baseline audit note (#408): `getSummary()` calls
/// `InvoiceService.sync()` synchronously on every invocation for a
/// `BillingProviderKind.STRIPE` organization — i.e. on every
/// `/billing`/`/settings/billing` page load, not on a background
/// poller. `InvoiceService.sync()`'s own doc comment already says this
/// plainly ("called on-demand ... when the billing page loads"); this
/// note exists because an earlier version of this file's comment
/// implied otherwise ("the billing UI never makes a live provider call
/// on every page load"), which was inaccurate for the STRIPE path and
/// has been corrected here. This means a Stripe-billed organization's
/// billing page latency includes two live Stripe API calls plus a
/// sequential per-invoice/per-payment-method DB upsert loop — real,
/// disclosed, deferred follow-up scope (a background sync job, as
/// `InvoiceService.sync()`'s comment already anticipates) rather than
/// restructured in this pass, since it cannot be verified against a
/// real Stripe account in this environment (see the Module 19 final
/// report's Security/Verification sections).
@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionService,
    private readonly invoices: InvoiceService,
    private readonly quotas: QuotaService,
  ) {}

  async listPlans(): Promise<PlanDto[]> {
    const plans = await this.prisma.plan.findMany({ where: { isActive: true }, orderBy: { priceMonthlyCents: 'asc' } });
    return plans.map(toPlanDto);
  }

  async getSummary(organizationId: string): Promise<BillingSummaryDto> {
    const subscriptionRow = await this.subscriptions.getOrCreate(organizationId);
    if (subscriptionRow.providerCustomerId) {
      await this.invoices.sync(organizationId, subscriptionRow.providerCustomerId);
    }
    const [subscription, usage, paymentMethods, invoiceList] = await Promise.all([
      this.subscriptions.getSummaryDto(organizationId),
      this.quotas.getPlanUsageSummary(organizationId),
      this.invoices.listPaymentMethods(organizationId),
      this.invoices.listInvoices(organizationId),
    ]);
    return { subscription, usage, paymentMethods, invoices: invoiceList };
  }
}
