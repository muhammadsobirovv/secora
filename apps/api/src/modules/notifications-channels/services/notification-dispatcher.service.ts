import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NotificationChannel } from '@pentesthub/shared';
import type { EnvConfig } from '../../../config/env.validation.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { NotificationChannelConfig } from '../../../prisma-types.js';
import { decryptChannelConfigSecrets } from '../notification-channel-config-crypto.util.js';

interface DeliveryResult {
  delivered: boolean;
  error: string | null;
}

/// Narrower than `NotificationChannelConfig` (the Prisma row type) — the
/// per-channel deliverers below only ever need `channel` and a *decrypted*
/// `config`, and threading `Record<string, unknown>` through here avoids
/// fighting Prisma's `JsonValue`/`InputJsonValue` distinction just to
/// build one intermediate object after decryption.
interface ChannelDeliveryInput {
  channel: string;
  config: Record<string, unknown>;
}

/// Fans a `BugBountyNotification` (Module 6) out to every enabled
/// channel configured for its recipient/workspace, recording a
/// `NotificationDelivery` row per attempt. Called from
/// `notification.commands.ts`'s existing create-notification path
/// (Module 6) as an additive side effect — see docs/adr/
/// 0009-bug-bounty-operating-system.md for why delivery fan-out is kept
/// here rather than folded into that command directly (keeps Module 6's
/// file untouched; this service is the one new integration point).
///
/// DESKTOP/BROWSER delivery is a no-op here by design — those two
/// channels are realtime push surfaces (the Desktop Agent's Live Sync
/// WebSocket from Module 8, and a future web push subscription) that
/// read `BugBountyNotification` directly rather than being "delivered to"
/// by this dispatcher; they're listed in `NotificationChannel` for
/// per-user preference toggling ("do you want desktop notifications for
/// this type of event") even though there's no outbound call to make for
/// them from the server's perspective.
@Injectable()
export class NotificationDispatcherService {
  private readonly logger = new Logger(NotificationDispatcherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  async dispatch(notificationId: string, workspaceId: string, userId: string, title: string, body: string | null): Promise<void> {
    const configs = await this.prisma.notificationChannelConfig.findMany({
      where: {
        workspaceId,
        enabled: true,
        OR: [{ userId }, { userId: null }],
      },
    });

    for (const config of configs) {
      const result = await this.deliverToChannel(config, title, body);
      await this.prisma.notificationDelivery.create({
        data: {
          notificationId,
          channel: config.channel,
          status: result.delivered ? 'DELIVERED' : 'FAILED',
          error: result.error,
          deliveredAt: result.delivered ? new Date() : undefined,
        },
      });
    }
  }

  async testChannel(config: NotificationChannelConfig): Promise<DeliveryResult> {
    return this.deliverToChannel(config, 'PentestHub AI — test notification', 'This confirms the channel is configured correctly.');
  }

  private async deliverToChannel(config: NotificationChannelConfig, title: string, body: string | null): Promise<DeliveryResult> {
    try {
      // Decrypt secret fields (webhookUrl/botToken/endpoint/headers) once,
      // up front — see notification-channel-config-crypto.util.ts. Every
      // per-channel deliverer below reads plaintext from here on, same as
      // before this encryption step existed.
      const encryptionKey = this.configService.get('CREDENTIAL_ENCRYPTION_KEY', {
        infer: true,
      });
      const decryptedConfig: ChannelDeliveryInput = {
        channel: config.channel,
        config: decryptChannelConfigSecrets(
          (config.config as Record<string, unknown>) ?? {},
          encryptionKey,
        ),
      };

      switch (config.channel as NotificationChannel) {
        case 'WEBHOOK':
        case 'DISCORD':
        case 'SLACK':
          return await this.deliverToWebhookShapedChannel(decryptedConfig, title, body);
        case 'TELEGRAM':
          return await this.deliverToTelegram(decryptedConfig, title, body);
        case 'CUSTOM_API':
          return await this.deliverToCustomApi(decryptedConfig, title, body);
        case 'EMAIL':
          // No transactional-email provider is configured anywhere in
          // this codebase yet (see the same disclosed gap noted in
          // collaboration/commands/workspace-invites.commands.ts for
          // invite emails) — recorded as a graceful no-op rather than a
          // silent failure, with the gap itself the documented follow-up.
          return { delivered: false, error: 'No email provider configured (see Module 9 verification handoff).' };
        case 'DESKTOP':
        case 'BROWSER':
          return { delivered: true, error: null };
        default:
          return { delivered: false, error: `Unknown channel: ${String(config.channel)}` };
      }
    } catch (error) {
      this.logger.warn(`Notification delivery to ${config.channel} failed: ${error instanceof Error ? error.message : String(error)}`);
      return { delivered: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /// Discord and Slack incoming webhooks, and generic "Webhook" channel,
  /// all accept the same minimal shape: POST a JSON body with a `content`/
  /// `text` field to a URL. Slack/Discord both also accept `content` as
  /// an alias in practice for simple text messages, so one function
  /// covers all three without per-provider payload branching.
  private async deliverToWebhookShapedChannel(
    config: ChannelDeliveryInput,
    title: string,
    body: string | null,
  ): Promise<DeliveryResult> {
    const cfg = config.config as { webhookUrl?: string };
    if (!cfg.webhookUrl) return { delivered: false, error: 'No webhookUrl configured.' };

    const text = body ? `**${title}**\n${body}` : title;
    const response = await fetch(cfg.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text, text }),
      signal: AbortSignal.timeout(10_000),
    });
    return { delivered: response.ok, error: response.ok ? null : `HTTP ${response.status}` };
  }

  private async deliverToTelegram(config: ChannelDeliveryInput, title: string, body: string | null): Promise<DeliveryResult> {
    const cfg = config.config as { botToken?: string; chatId?: string };
    if (!cfg.botToken || !cfg.chatId) return { delivered: false, error: 'botToken/chatId not configured.' };

    const text = body ? `${title}\n${body}` : title;
    const response = await fetch(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: cfg.chatId, text }),
      signal: AbortSignal.timeout(10_000),
    });
    return { delivered: response.ok, error: response.ok ? null : `HTTP ${response.status}` };
  }

  private async deliverToCustomApi(config: ChannelDeliveryInput, title: string, body: string | null): Promise<DeliveryResult> {
    const cfg = config.config as { endpoint?: string; headers?: Record<string, string> };
    if (!cfg.endpoint) return { delivered: false, error: 'No endpoint configured.' };

    const response = await fetch(cfg.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cfg.headers ?? {}) },
      body: JSON.stringify({ title, body }),
      signal: AbortSignal.timeout(10_000),
    });
    return { delivered: response.ok, error: response.ok ? null : `HTTP ${response.status}` };
  }
}
