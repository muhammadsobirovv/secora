import type { WebhookDeliveryDto } from '@pentesthub/shared';
import type { WebhookDelivery } from '../../../prisma-types.js';

export function toWebhookDeliveryDto(delivery: WebhookDelivery): WebhookDeliveryDto {
  return {
    id: delivery.id,
    webhookTokenId: delivery.webhookTokenId,
    event: delivery.event,
    status: delivery.status,
    attempt: delivery.attempt,
    maxAttempts: delivery.maxAttempts,
    statusCode: delivery.statusCode,
    error: delivery.error,
    nextAttemptAt: delivery.nextAttemptAt.toISOString(),
    deliveredAt: delivery.deliveredAt ? delivery.deliveredAt.toISOString() : null,
    createdAt: delivery.createdAt.toISOString(),
  };
}
