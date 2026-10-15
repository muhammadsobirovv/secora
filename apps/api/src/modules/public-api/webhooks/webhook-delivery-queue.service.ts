import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { EnvConfig } from '../../../config/env.validation.js';
import type { WebhookDelivery, WebhookToken } from '../../../prisma-types.js';
import { decryptWebhookSecret, signWebhookPayload } from './webhook-signature.util.js';
import { withSpan } from '../../../observability/tracing.js';
import { MetricsRegistryService } from '../../observability/metrics-registry.service.js';
import { PollerLeaseService } from '../../../common/concurrency/poller-lease.service.js';
import { assertSafeWebhookUrl } from '../../../common/utils/ssrf-guard.util.js';

const LEASE_NAME = 'webhook-delivery-queue';
const LEASE_TTL_MS = 90_000; // 1.5x the 60s tick interval — see PollerLeaseService's doc comment.

type WebhookDeliveryWithToken = WebhookDelivery & { webhookToken: WebhookToken };

/// Minute-tick poller that actually delivers `WebhookDelivery` rows —
/// the same hand-rolled `setInterval` + `OnModuleInit`/`OnModuleDestroy`
/// shape as `ScheduledJobRunnerService` and `ReportScheduleRunnerService`
/// (see either's doc comment for why this avoids a new `@nestjs/schedule`
/// dependency). `WebhookDispatchHandler` only inserts PENDING rows; this
/// service is where the outbound HTTP call, HMAC signing, retry backoff,
/// and DEAD_LETTER transition actually happen — kept as a separate
/// class/tick so a slow or unreachable receiving endpoint never blocks
/// the request that triggered the underlying domain event.
///
/// Backoff schedule: attempt 1 immediate (queued at insert time), then
/// 1m, 5m, 15m, 60m, 180m — 6 total attempts (`maxAttempts` default on
/// the model) before DEAD_LETTER. This is a fixed schedule rather than
/// pure exponential-with-jitter for simplicity. `tick()` is gated by
/// `PollerLeaseService` (Module 10 — High Availability) so running many
/// replicas of the API process no longer risks duplicate delivery
/// attempts each minute — only the replica holding the
/// "webhook-delivery-queue" lease actually runs `runTick()`; at-least-
/// once delivery semantics with idempotent receivers (the
/// `X-Secora-Delivery-Id` header lets a receiver dedupe) remain the
/// right mental model regardless, since a lease can still fail over
/// mid-delivery on a crashed replica.
@Injectable()
export class WebhookDeliveryQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhookDeliveryQueueService.name);
  private intervalHandle: ReturnType<typeof setInterval> | undefined;
  private static readonly BACKOFF_MINUTES = [1, 5, 15, 60, 180];
  private static readonly REQUEST_TIMEOUT_MS = 10_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly metrics: MetricsRegistryService,
    private readonly leases: PollerLeaseService,
  ) {}

  onModuleInit(): void {
    this.intervalHandle = setInterval(() => {
      void this.tick();
    }, 60_000);
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) clearInterval(this.intervalHandle);
  }

  /// Module 10 — High Availability: gated by PollerLeaseService so only
  /// one replica actually delivers on any given tick — see that
  /// service's doc comment for why this matters once this API process
  /// runs at more than one replica.
  async tick(): Promise<void> {
    await this.leases.withLease(LEASE_NAME, LEASE_TTL_MS, () => this.runTick());
  }

  private async runTick(): Promise<void> {
    const due = await this.prisma.webhookDelivery.findMany({
      where: { status: 'PENDING', nextAttemptAt: { lte: new Date() } },
      include: { webhookToken: true },
      take: 100,
    });
    for (const delivery of due) {
      try {
        await this.attemptDelivery(delivery);
      } catch (error) {
        this.logger.error(
          `Unexpected error delivering webhook delivery ${delivery.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  private async attemptDelivery(delivery: WebhookDeliveryWithToken): Promise<void> {
    const { webhookToken } = delivery;

    if (!webhookToken.enabled || webhookToken.revokedAt) {
      await this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: 'FAILED', error: 'Webhook was disabled or revoked before delivery.' },
      });
      return;
    }

    // Module 15 — task #344 security hardening: re-check the destination
    // is still safe on every single delivery attempt, not just once at
    // webhook-creation time — a hostname that resolved to a public IP when
    // the webhook was created can be re-pointed at an internal/private
    // address later (DNS rebinding), and this poller runs unattended.
    const attempt = delivery.attempt + 1;
    try {
      await assertSafeWebhookUrl(webhookToken.url);
    } catch (error) {
      await this.recordFailure(
        delivery.id,
        attempt,
        error instanceof Error ? error.message : 'Webhook URL failed the safety check.',
        null,
      );
      return;
    }

    const rawSecret = decryptWebhookSecret(webhookToken.secret, this.configService);
    const body = JSON.stringify(delivery.payload);
    const signature = signWebhookPayload(rawSecret, body);

    try {
      const response = await withSpan('webhook.delivery.send', (span) => {
        span.setAttribute('webhook.event', delivery.event);
        span.setAttribute('webhook.delivery.id', delivery.id);
        span.setAttribute('webhook.attempt', attempt);
        return fetch(webhookToken.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Secora-Signature': signature,
            'X-Secora-Event': delivery.event,
            'X-Secora-Delivery-Id': delivery.id,
          },
          body,
          signal: AbortSignal.timeout(WebhookDeliveryQueueService.REQUEST_TIMEOUT_MS),
        });
      });

      if (response.ok) {
        await this.prisma.$transaction([
          this.prisma.webhookDelivery.update({
            where: { id: delivery.id },
            data: { status: 'DELIVERED', attempt, statusCode: response.status, deliveredAt: new Date(), error: null },
          }),
          this.prisma.webhookToken.update({
            where: { id: webhookToken.id },
            data: { lastTriggeredAt: new Date() },
          }),
        ]);
        this.metrics.webhookDeliveriesTotal.inc({ event: delivery.event, outcome: 'delivered' });
        return;
      }

      await this.recordFailure(delivery.id, attempt, `HTTP ${response.status}`, response.status);
    } catch (error) {
      await this.recordFailure(delivery.id, attempt, error instanceof Error ? error.message : 'Unknown error', null);
    }
  }

  private async recordFailure(
    deliveryId: string,
    attempt: number,
    error: string,
    statusCode: number | null,
  ): Promise<void> {
    const delivery = await this.prisma.webhookDelivery.findUniqueOrThrow({ where: { id: deliveryId } });

    if (attempt >= delivery.maxAttempts) {
      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: { status: 'DEAD_LETTER', attempt, error, statusCode },
      });
      this.metrics.webhookDeliveriesTotal.inc({ event: delivery.event, outcome: 'dead_letter' });
      this.logger.warn(`Webhook delivery ${deliveryId} moved to DEAD_LETTER after ${attempt} attempts: ${error}`);
      return;
    }

    const backoffMinutes =
      WebhookDeliveryQueueService.BACKOFF_MINUTES[
        Math.min(attempt - 1, WebhookDeliveryQueueService.BACKOFF_MINUTES.length - 1)
      ];
    const nextAttemptAt = new Date(Date.now() + backoffMinutes * 60_000);

    await this.prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: { status: 'PENDING', attempt, error, statusCode, nextAttemptAt },
    });
    this.metrics.webhookDeliveriesTotal.inc({ event: delivery.event, outcome: 'retry_scheduled' });
  }
}
