import type { NotificationChannelConfigDto } from '@pentesthub/shared';
import type { NotificationChannelConfig } from '../../../prisma-types.js';

/// Secret-bearing keys (webhook URLs, bot tokens, custom-API headers)
/// are redacted to `"***"` in every DTO response — the raw config is
/// only ever needed server-side to actually deliver a notification
/// (`NotificationDispatcherService`), never round-tripped back to a
/// client for display. Matches how AiProviderCredential (Module 5)
/// exposes only a `keyPreview`, never the real secret.
const SECRET_KEYS = ['webhookUrl', 'botToken', 'headers', 'endpoint'];

export function toNotificationChannelConfigDto(config: NotificationChannelConfig): NotificationChannelConfigDto {
  const raw = (config.config as Record<string, unknown>) ?? {};
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    redacted[key] = SECRET_KEYS.includes(key) ? '***' : value;
  }

  return {
    id: config.id,
    workspaceId: config.workspaceId,
    userId: config.userId,
    channel: config.channel,
    config: redacted,
    enabled: config.enabled,
    createdAt: config.createdAt.toISOString(),
    updatedAt: config.updatedAt.toISOString(),
  };
}
