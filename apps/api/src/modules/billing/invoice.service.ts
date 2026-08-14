import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { InvoiceDto, PaymentMethodDto } from '@pentesthub/shared';
import { AppException } from '../../common/exceptions/app.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PAYMENT_PROVIDER } from '../../common/providers/tokens.js';
import type { PaymentProvider } from './providers/payment-provider.interface.js';
import { toInvoiceDto, toPaymentMethodDto } from './mappers/to-billing-dto.mapper.js';

/// Module 15 — InvoiceService (task #331). For `BillingProviderKind.STRIPE`,
/// `sync()` pulls the provider's current invoice/payment-method list and
/// mirrors it into the local `Invoice`/`PaymentMethod` tables (so the
/// billing UI never makes a live provider call on every page load —
/// it's a periodic sync, not a proxy). For `NONE`/`MANUAL`, the local
/// tables ARE the source of truth (an operator enters manual invoices
/// directly), so `sync()` is a no-op.
@Injectable()
export class InvoiceService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProvider,
  ) {}

  async listInvoices(organizationId: string): Promise<InvoiceDto[]> {
    const invoices = await this.prisma.invoice.findMany({
      where: { organizationId },
      orderBy: { issuedAt: 'desc' },
    });
    return invoices.map(toInvoiceDto);
  }

  async getInvoice(organizationId: string, invoiceId: string): Promise<InvoiceDto> {
    const invoice = await this.prisma.invoice.findFirst({ where: { id: invoiceId, organizationId } });
    if (!invoice) {
      throw new AppException('INVOICE_NOT_FOUND', `No invoice with id "${invoiceId}" for this organization.`, HttpStatus.NOT_FOUND);
    }
    return toInvoiceDto(invoice);
  }

  async listPaymentMethods(organizationId: string): Promise<PaymentMethodDto[]> {
    const methods = await this.prisma.paymentMethod.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' } });
    return methods.map(toPaymentMethodDto);
  }

  /// Called on-demand (e.g. when the billing page loads for a Stripe
  /// customer) rather than on a poller — invoice history changes rarely
  /// enough that a background sync job isn't worth another
  /// `PollerLeaseService` lease for this pass; a future pass can add one
  /// if a deployment's invoice volume justifies it.
  async sync(organizationId: string, providerCustomerId: string | null): Promise<void> {
    if (this.paymentProvider.kind === 'NONE' || this.paymentProvider.kind === 'MANUAL' || !providerCustomerId) return;

    const [providerInvoices, providerMethods] = await Promise.all([
      this.paymentProvider.listInvoices(providerCustomerId),
      this.paymentProvider.listPaymentMethods(providerCustomerId),
    ]);

    for (const invoice of providerInvoices) {
      await this.prisma.invoice.upsert({
        where: { id: `stripe_${invoice.providerInvoiceId}` },
        create: {
          id: `stripe_${invoice.providerInvoiceId}`,
          organizationId,
          provider: 'STRIPE',
          providerInvoiceId: invoice.providerInvoiceId,
          status: invoice.status,
          amountCents: invoice.amountCents,
          currency: invoice.currency,
          issuedAt: invoice.issuedAt,
          paidAt: invoice.paidAt,
          hostedInvoiceUrl: invoice.hostedInvoiceUrl,
          pdfUrl: invoice.pdfUrl,
        },
        update: { status: invoice.status, paidAt: invoice.paidAt },
      });
    }

    await this.prisma.paymentMethod.deleteMany({ where: { organizationId, provider: 'STRIPE' } });
    for (const method of providerMethods) {
      await this.prisma.paymentMethod.create({
        data: {
          organizationId,
          provider: 'STRIPE',
          providerPaymentMethodId: method.providerPaymentMethodId,
          brand: method.brand,
          last4: method.last4,
          expMonth: method.expMonth,
          expYear: method.expYear,
          isDefault: providerMethods[0]?.providerPaymentMethodId === method.providerPaymentMethodId,
        },
      });
    }
  }
}
