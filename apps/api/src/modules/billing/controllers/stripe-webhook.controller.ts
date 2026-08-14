import { Controller, HttpCode, HttpStatus, Headers, Logger, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import type { PlanTier, SubscriptionStatus } from '@pentesthub/shared';
import type { EnvConfig } from '../../../config/env.validation.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { Public } from '../../../common/decorators/public.decorator.js';
import { SubscriptionService } from '../subscription.service.js';
import { InvoiceService } from '../invoice.service.js';

const SIGNATURE_HEADER = 'stripe-signature';
// Stripe's own tolerance default — reject events whose `t=` timestamp is
// older than this to blunt replay of a captured (or leaked) webhook
// payload even if the signing secret itself were ever exposed.
const TOLERANCE_SECONDS = 5 * 60;

interface StripeEventEnvelope {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

/// Module 15 — task #366. Stripe-specific webhook receiver, deliberately
/// separate from `BillingWebhookController` (Module 14,
/// `apps/api/src/modules/enterprise/controllers/billing-webhook.controller.ts`):
/// that controller is a generic, shared-secret-authenticated receiver
/// that only updates the legacy `Organization.plan`/`subscriptionStatus`
/// string columns — it was written before the Module 15 `Subscription`/
/// `Invoice` tables existed and its own doc comment explicitly invites
/// exactly this kind of provider-specific extension rather than being
/// edited to grow Stripe-specific behavior. This controller instead:
///
/// 1. Verifies Stripe's own HMAC-SHA256 signature scheme (`Stripe-Signature:
///    t=<unix_ts>,v1=<hex_hmac>`) against `req.rawBody` — not the shared
///    `BILLING_WEBHOOK_SECRET`, but `STRIPE_WEBHOOK_SECRET`, matching
///    Stripe's own per-endpoint signing-secret model.
/// 2. Writes directly into `Subscription`/`Invoice` via
///    `SubscriptionService`/`InvoiceService`.
///
/// No `stripe` npm SDK dependency — hand-rolled verification, consistent
/// with `StripePaymentProvider`'s established "plain `fetch()`, zero
/// unnecessary runtime dependencies" precedent (see that file's doc
/// comment). `req.rawBody` requires `NestFactory.create(AppModule, {
/// rawBody: true })` (see `main.ts`) — the signature is computed over the
/// exact bytes Stripe sent, and re-serializing the already-parsed JSON
/// body would not reproduce them byte-for-byte.
@ApiTags('billing')
@Controller('billing/webhook')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly subscriptions: SubscriptionService,
    private readonly invoices: InvoiceService,
  ) {}

  @Public()
  @Post('stripe')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiExcludeEndpoint() // called by Stripe's servers, not a documented client-facing API
  async receive(@Req() req: RawBodyRequest<Request>, @Headers(SIGNATURE_HEADER) signatureHeader: string | undefined): Promise<void> {
    const secret = this.configService.get('STRIPE_WEBHOOK_SECRET', { infer: true });
    if (!secret) {
      throw new AppException(
        'STRIPE_WEBHOOK_NOT_CONFIGURED',
        'STRIPE_WEBHOOK_SECRET is not configured — this endpoint cannot verify Stripe webhook signatures.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    if (!req.rawBody) {
      // Should be unreachable once `rawBody: true` is set in main.ts — if
      // this fires, Nest's raw-body capture was disabled or bypassed
      // upstream (e.g. a proxy that re-serializes the body).
      throw new AppException(
        'STRIPE_WEBHOOK_NO_RAW_BODY',
        'Raw request body is unavailable — cannot verify the Stripe signature.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    this.verifySignature(req.rawBody, signatureHeader, secret);

    let event: StripeEventEnvelope;
    try {
      event = JSON.parse(req.rawBody.toString('utf8')) as StripeEventEnvelope;
    } catch {
      throw new AppException('STRIPE_WEBHOOK_INVALID_PAYLOAD', 'Webhook payload is not valid JSON.', HttpStatus.BAD_REQUEST);
    }

    await this.handleEvent(event);
  }

  private verifySignature(rawBody: Buffer, signatureHeader: string | undefined, secret: string): void {
    if (!signatureHeader) {
      throw new AppException('STRIPE_WEBHOOK_UNAUTHORIZED', `Missing ${SIGNATURE_HEADER} header.`, HttpStatus.UNAUTHORIZED);
    }

    // Header format: "t=1614556800,v1=<hex>,v0=<hex-legacy>" — only `t`
    // and `v1` are meaningful for current signing scheme verification.
    const parts = new Map<string, string>();
    for (const segment of signatureHeader.split(',')) {
      const [key, value] = segment.split('=');
      if (key && value) parts.set(key, value);
    }
    const timestamp = parts.get('t');
    const providedSignature = parts.get('v1');
    if (!timestamp || !providedSignature) {
      throw new AppException('STRIPE_WEBHOOK_UNAUTHORIZED', `Malformed ${SIGNATURE_HEADER} header.`, HttpStatus.UNAUTHORIZED);
    }

    const timestampSeconds = Number(timestamp);
    if (!Number.isFinite(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > TOLERANCE_SECONDS) {
      throw new AppException(
        'STRIPE_WEBHOOK_UNAUTHORIZED',
        'Webhook timestamp is outside the allowed tolerance window (possible replay).',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const signedPayload = `${timestamp}.${rawBody.toString('utf8')}`;
    const expectedSignature = createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');

    const expectedBuf = Buffer.from(expectedSignature, 'hex');
    const providedBuf = Buffer.from(providedSignature, 'hex');
    // Same length-independent-timing posture as
    // `BillingWebhookController`'s `secretsMatch()` — an invalid-length
    // hex string compares against a same-length zero buffer first rather
    // than short-circuiting on `providedBuf.length !== expectedBuf.length`
    // alone.
    if (providedBuf.length !== expectedBuf.length) {
      timingSafeEqual(Buffer.alloc(expectedBuf.length), expectedBuf);
      throw new AppException('STRIPE_WEBHOOK_UNAUTHORIZED', 'Signature verification failed.', HttpStatus.UNAUTHORIZED);
    }
    if (!timingSafeEqual(providedBuf, expectedBuf)) {
      throw new AppException('STRIPE_WEBHOOK_UNAUTHORIZED', 'Signature verification failed.', HttpStatus.UNAUTHORIZED);
    }
  }

  private async handleEvent(event: StripeEventEnvelope): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed':
        // Deliberately a no-op: this event's payload only carries
        // customer/subscription *IDs*, not the authoritative
        // status/period fields `applyStripeWebhookUpdate` needs, and
        // Stripe always follows a completed checkout with a
        // `customer.subscription.created` event carrying the full
        // object — handling that event instead avoids writing a
        // partial/guessed state here.
        this.logger.log(`Received checkout.session.completed (event ${event.id}) — awaiting customer.subscription.created for full state.`);
        return;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.applySubscriptionObject(event.data.object);
        return;

      case 'customer.subscription.deleted':
        await this.applySubscriptionObject(event.data.object, 'CANCELED');
        return;

      case 'invoice.paid':
      case 'invoice.payment_failed':
        await this.syncInvoices(event.data.object);
        return;

      default:
        this.logger.debug(`Ignoring unhandled Stripe event type "${event.type}" (event ${event.id}).`);
    }
  }

  private async applySubscriptionObject(subscriptionObject: Record<string, unknown>, forcedStatus?: SubscriptionStatus): Promise<void> {
    const providerCustomerId = typeof subscriptionObject.customer === 'string' ? subscriptionObject.customer : null;
    const providerSubscriptionId = typeof subscriptionObject.id === 'string' ? subscriptionObject.id : null;
    if (!providerCustomerId || !providerSubscriptionId) {
      this.logger.warn('Stripe subscription webhook payload missing customer/id — ignored.');
      return;
    }

    const status = forcedStatus ?? this.mapStripeStatus(typeof subscriptionObject.status === 'string' ? subscriptionObject.status : '');
    const currentPeriodStart = toDate(subscriptionObject.current_period_start);
    const currentPeriodEnd = toDate(subscriptionObject.current_period_end);
    const cancelAtPeriodEnd = subscriptionObject.cancel_at_period_end === true;

    let planTier: PlanTier | undefined;
    if (forcedStatus === 'CANCELED') {
      // A deleted Stripe subscription — mirror the app's own immediate
      // cancel() behavior (see SubscriptionService.cancel(atPeriodEnd=false))
      // by dropping back to FREE rather than leaving the last paid tier set.
      planTier = 'FREE';
    } else {
      const priceId = extractFirstPriceId(subscriptionObject);
      if (priceId) {
        planTier = await this.subscriptions.resolvePlanTierByStripePriceId(priceId);
      }
    }

    await this.subscriptions.applyStripeWebhookUpdate({
      providerCustomerId,
      providerSubscriptionId,
      status,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd,
      planTier,
    });
  }

  private async syncInvoices(invoiceObject: Record<string, unknown>): Promise<void> {
    const providerCustomerId = typeof invoiceObject.customer === 'string' ? invoiceObject.customer : null;
    if (!providerCustomerId) {
      this.logger.warn('Stripe invoice webhook payload missing customer — ignored.');
      return;
    }
    const subscription = await this.subscriptions.findByProviderCustomerId(providerCustomerId);
    if (!subscription) {
      this.logger.warn(`Stripe invoice webhook referenced unknown providerCustomerId "${providerCustomerId}" — ignored.`);
      return;
    }
    await this.invoices.sync(subscription.organizationId, providerCustomerId);
  }

  private mapStripeStatus(stripeStatus: string): SubscriptionStatus {
    switch (stripeStatus) {
      case 'trialing':
        return 'TRIALING';
      case 'active':
        return 'ACTIVE';
      case 'past_due':
      case 'unpaid':
      case 'incomplete':
        return 'PAST_DUE';
      case 'canceled':
        return 'CANCELED';
      case 'incomplete_expired':
      case 'paused':
        return 'EXPIRED';
      default:
        return 'NONE';
    }
  }
}

function toDate(value: unknown): Date | null {
  return typeof value === 'number' ? new Date(value * 1000) : null;
}

/// Stripe's `subscription.items.data[0].price.id` — the first line item's
/// price, which is what this platform's `Plan.providerMetadata.stripe.monthlyPriceId`
/// is matched against. Deliberately only reads the first item: every plan
/// this app configures is single-price (see `upgrade()`'s
/// `line_items[0][price]` in `StripePaymentProvider.createCheckoutSessionForPrice`),
/// so a subscription with multiple items is outside this reference
/// implementation's scope — `resolvePlanTierByStripePriceId` simply
/// returns `undefined` for a price it doesn't recognize, leaving the
/// current plan unchanged rather than guessing.
function extractFirstPriceId(subscriptionObject: Record<string, unknown>): string | null {
  const items = subscriptionObject.items as { data?: unknown[] } | undefined;
  const first = items?.data?.[0] as { price?: { id?: string } } | undefined;
  return first?.price?.id ?? null;
}
