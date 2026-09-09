import { describe, expect, it, jest } from '@jest/globals';
import { createHmac } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import type { SubscriptionService } from '../subscription.service.js';
import type { InvoiceService } from '../invoice.service.js';
import { StripeWebhookController } from './stripe-webhook.controller.js';

/// Module 15 — task #366/#362. Sandbox disclosure: `jest` cannot run in
/// this development sandbox — see `feature-flags.service.spec.ts`'s doc
/// comment for the standing reason. Written and manually traced against
/// the controller's actual signature-verification logic; must be
/// executed on a normal machine before this module ships.
const SECRET = 'whsec_test_secret';

function sign(payload: string, timestamp: number): string {
  const signedPayload = `${timestamp}.${payload}`;
  return createHmac('sha256', SECRET).update(signedPayload, 'utf8').digest('hex');
}

function buildController(opts: { applyStripeWebhookUpdate?: jest.Mock; findByProviderCustomerId?: jest.Mock; invoiceSync?: jest.Mock }) {
  const configService = { get: jest.fn(() => SECRET) } as unknown as ConfigService;
  const subscriptions: Partial<SubscriptionService> = {
    applyStripeWebhookUpdate: opts.applyStripeWebhookUpdate ?? jest.fn(async () => undefined),
    findByProviderCustomerId: opts.findByProviderCustomerId ?? jest.fn(async () => null),
    resolvePlanTierByStripePriceId: jest.fn(async () => undefined),
  };
  const invoices: Partial<InvoiceService> = { sync: opts.invoiceSync ?? jest.fn(async () => undefined) };
  const controller = new StripeWebhookController(configService, subscriptions as SubscriptionService, invoices as InvoiceService);
  return { controller };
}

function requestWithBody(body: object): RawBodyRequest<Request> {
  const raw = Buffer.from(JSON.stringify(body), 'utf8');
  return { rawBody: raw } as unknown as RawBodyRequest<Request>;
}

describe('StripeWebhookController.receive', () => {
  it('rejects a request with no Stripe-Signature header', async () => {
    const { controller } = buildController({});
    const req = requestWithBody({ id: 'evt_1', type: 'ping', data: { object: {} } });
    await expect(controller.receive(req, undefined)).rejects.toMatchObject({ code: 'STRIPE_WEBHOOK_UNAUTHORIZED' });
  });

  it('rejects a request with an invalid signature', async () => {
    const { controller } = buildController({});
    const req = requestWithBody({ id: 'evt_1', type: 'ping', data: { object: {} } });
    const badHeader = `t=${Math.floor(Date.now() / 1000)},v1=${'0'.repeat(64)}`;
    await expect(controller.receive(req, badHeader)).rejects.toMatchObject({ code: 'STRIPE_WEBHOOK_UNAUTHORIZED' });
  });

  it('rejects a correctly-signed request whose timestamp is outside the 5-minute tolerance (replay defense)', async () => {
    const { controller } = buildController({});
    const body = { id: 'evt_1', type: 'ping', created: Math.floor(Date.now() / 1000), data: { object: {} } };
    const raw = Buffer.from(JSON.stringify(body), 'utf8');
    const oldTimestamp = Math.floor(Date.now() / 1000) - 10 * 60; // 10 minutes ago
    const signature = sign(raw.toString('utf8'), oldTimestamp);
    const req = { rawBody: raw } as unknown as RawBodyRequest<Request>;
    await expect(controller.receive(req, `t=${oldTimestamp},v1=${signature}`)).rejects.toMatchObject({
      code: 'STRIPE_WEBHOOK_UNAUTHORIZED',
    });
  });

  it('accepts a validly-signed customer.subscription.updated event and calls applyStripeWebhookUpdate', async () => {
    const applyStripeWebhookUpdate = jest.fn(async () => undefined);
    const { controller } = buildController({ applyStripeWebhookUpdate });
    const eventCreated = Math.floor(Date.now() / 1000);
    const body = {
      id: 'evt_1',
      type: 'customer.subscription.updated',
      created: eventCreated,
      data: {
        object: {
          id: 'sub_123',
          customer: 'cus_123',
          status: 'active',
          current_period_start: 1_700_000_000,
          current_period_end: 1_702_592_000,
          cancel_at_period_end: false,
          items: { data: [] },
        },
      },
    };
    const raw = Buffer.from(JSON.stringify(body), 'utf8');
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = sign(raw.toString('utf8'), timestamp);
    const req = { rawBody: raw } as unknown as RawBodyRequest<Request>;

    await controller.receive(req, `t=${timestamp},v1=${signature}`);

    expect(applyStripeWebhookUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        providerCustomerId: 'cus_123',
        providerSubscriptionId: 'sub_123',
        status: 'ACTIVE',
        eventId: 'evt_1',
        eventCreatedAt: new Date(eventCreated * 1000),
      }),
    );
  });

  it('is a no-op for checkout.session.completed (awaits the follow-up subscription event instead)', async () => {
    const applyStripeWebhookUpdate = jest.fn(async () => undefined);
    const { controller } = buildController({ applyStripeWebhookUpdate });
    const body = {
      id: 'evt_1',
      type: 'checkout.session.completed',
      created: Math.floor(Date.now() / 1000),
      data: { object: { customer: 'cus_123', subscription: 'sub_123' } },
    };
    const raw = Buffer.from(JSON.stringify(body), 'utf8');
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = sign(raw.toString('utf8'), timestamp);
    const req = { rawBody: raw } as unknown as RawBodyRequest<Request>;

    await controller.receive(req, `t=${timestamp},v1=${signature}`);

    expect(applyStripeWebhookUpdate).not.toHaveBeenCalled();
  });
});
