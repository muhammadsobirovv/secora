import type { WebhookTokenDto } from '@pentesthub/shared';
import type { WebhookToken } from '../../../prisma-types.js';

export function toWebhookTokenDto(webhook: WebhookToken): WebhookTokenDto {
  return {
    id: webhook.id,
    workspaceId: webhook.workspaceId,
    name: webhook.name,
    url: webhook.url,
    events: webhook.events,
    enabled: webhook.enabled,
    lastTriggeredAt: webhook.lastTriggeredAt ? webhook.lastTriggeredAt.toISOString() : null,
    createdAt: webhook.createdAt.toISOString(),
  };
}
