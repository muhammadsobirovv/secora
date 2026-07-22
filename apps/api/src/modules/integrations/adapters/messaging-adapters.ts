import { Injectable } from '@nestjs/common';
import type { IntegrationAdapter } from '../integration-adapter.interface.js';
import { IntegrationActionError } from '../integration-adapter.interface.js';

async function fetchJson(url: string, init: RequestInit): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, init);
  const contentType = response.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json') ? await response.json() : await response.text();
  return { status: response.status, body };
}

/// v1 scope: post a message to a channel. Auth: a Slack Bot User OAuth
/// Token (`xoxb-...`) sent as `Authorization: Bearer <token>`. Slack's
/// REST API always returns HTTP 200 with an `ok: boolean` body field even
/// on failure, so both testConnection and execute inspect `body.ok`
/// rather than relying on the HTTP status code alone.
@Injectable()
export class SlackAdapter implements IntegrationAdapter {
  readonly provider = 'SLACK' as const;
  readonly actions = ['sendMessage', 'listChannels'];

  async testConnection(credentials: string): Promise<{ ok: boolean; message: string }> {
    const { status, body } = await fetchJson('https://slack.com/api/auth.test', {
      method: 'POST',
      headers: { Authorization: `Bearer ${credentials}` },
    });
    const ok = status === 200 && (body as { ok?: boolean }).ok === true;
    if (!ok) return { ok: false, message: `Slack auth.test failed: ${JSON.stringify(body)}` };
    const team = (body as { team?: string }).team ?? 'unknown';
    return { ok: true, message: `Connected to workspace ${team}` };
  }

  async execute(action: string, credentials: string, _config: Record<string, unknown> | null, payload: Record<string, unknown>): Promise<unknown> {
    const headers = { Authorization: `Bearer ${credentials}`, 'Content-Type': 'application/json; charset=utf-8' };
    if (action === 'sendMessage') {
      const { channel, text, blocks } = payload as { channel: string; text: string; blocks?: unknown };
      const { status, body } = await fetchJson('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers,
        body: JSON.stringify({ channel, text, blocks }),
      });
      if (status !== 200 || (body as { ok?: boolean }).ok !== true) {
        throw new IntegrationActionError(`Slack sendMessage failed: ${JSON.stringify(body)}`);
      }
      return body;
    }
    if (action === 'listChannels') {
      const { status, body } = await fetchJson('https://slack.com/api/conversations.list?limit=200', { headers });
      if (status !== 200 || (body as { ok?: boolean }).ok !== true) {
        throw new IntegrationActionError(`Slack listChannels failed: ${JSON.stringify(body)}`);
      }
      return body;
    }
    throw new IntegrationActionError(`Unsupported Slack action: ${action}`);
  }
}

/// v1 scope: post a message via an incoming webhook (simplest, most
/// common Discord integration path — no bot token/gateway connection
/// needed). `credentials` holds the full webhook URL
/// (`https://discord.com/api/webhooks/<id>/<token>`); `testConnection`
/// does a GET on that same URL, which Discord accepts and answers with
/// the webhook's metadata without posting anything.
@Injectable()
export class DiscordAdapter implements IntegrationAdapter {
  readonly provider = 'DISCORD' as const;
  readonly actions = ['sendMessage'];

  async testConnection(credentials: string): Promise<{ ok: boolean; message: string }> {
    const { status, body } = await fetchJson(credentials, { method: 'GET' });
    if (status !== 200) return { ok: false, message: `Discord webhook check failed (${status}): ${JSON.stringify(body)}` };
    const name = (body as { name?: string }).name ?? 'unknown';
    return { ok: true, message: `Connected to webhook "${name}"` };
  }

  async execute(action: string, credentials: string, _config: Record<string, unknown> | null, payload: Record<string, unknown>): Promise<unknown> {
    if (action !== 'sendMessage') throw new IntegrationActionError(`Unsupported Discord action: ${action}`);
    const { content, username, embeds } = payload as { content: string; username?: string; embeds?: unknown };
    const { status, body } = await fetchJson(`${credentials}?wait=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, username, embeds }),
    });
    if (status >= 300) throw new IntegrationActionError(`Discord sendMessage failed (${status}): ${JSON.stringify(body)}`);
    return body;
  }
}

/// v1 scope: post a message via a Microsoft Teams incoming webhook
/// connector. `credentials` holds the full webhook URL. Teams' legacy
/// "Office 365 Connector" webhook accepts a MessageCard payload and
/// responds with the bare text "1" (not JSON) on success — handled
/// explicitly rather than via fetchJson's content-type sniff.
@Injectable()
export class MsTeamsAdapter implements IntegrationAdapter {
  readonly provider = 'MS_TEAMS' as const;
  readonly actions = ['sendMessage'];

  async testConnection(credentials: string): Promise<{ ok: boolean; message: string }> {
    try {
      const response = await fetch(credentials, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ '@type': 'MessageCard', '@context': 'http://schema.org/extensions', text: 'PentestHub AI connection test' }),
      });
      const text = await response.text();
      if (response.status >= 300) return { ok: false, message: `Teams webhook test failed (${response.status}): ${text}` };
      return { ok: true, message: 'Teams webhook accepted a test message' };
    } catch (error) {
      return { ok: false, message: `Teams webhook unreachable: ${(error as Error).message}` };
    }
  }

  async execute(action: string, credentials: string, _config: Record<string, unknown> | null, payload: Record<string, unknown>): Promise<unknown> {
    if (action !== 'sendMessage') throw new IntegrationActionError(`Unsupported MS Teams action: ${action}`);
    const { title, text } = payload as { title?: string; text: string };
    const response = await fetch(credentials, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ '@type': 'MessageCard', '@context': 'http://schema.org/extensions', title, text }),
    });
    const responseText = await response.text();
    if (response.status >= 300) throw new IntegrationActionError(`MS Teams sendMessage failed (${response.status}): ${responseText}`);
    return { status: response.status, body: responseText };
  }
}

/// v1 scope: send a message via a Telegram Bot. `credentials` holds the
/// bot token (from @BotFather); `payload.chatId` identifies the
/// destination chat (a user must have started the bot, or the bot must
/// be a member of the target group/channel, per Telegram's rules).
@Injectable()
export class TelegramAdapter implements IntegrationAdapter {
  readonly provider = 'TELEGRAM' as const;
  readonly actions = ['sendMessage'];

  private apiUrl(credentials: string, method: string): string {
    return `https://api.telegram.org/bot${credentials}/${method}`;
  }

  async testConnection(credentials: string): Promise<{ ok: boolean; message: string }> {
    const { status, body } = await fetchJson(this.apiUrl(credentials, 'getMe'), { method: 'GET' });
    const ok = status === 200 && (body as { ok?: boolean }).ok === true;
    if (!ok) return { ok: false, message: `Telegram getMe failed: ${JSON.stringify(body)}` };
    const username = (body as { result?: { username?: string } }).result?.username ?? 'unknown';
    return { ok: true, message: `Connected as bot @${username}` };
  }

  async execute(action: string, credentials: string, _config: Record<string, unknown> | null, payload: Record<string, unknown>): Promise<unknown> {
    if (action !== 'sendMessage') throw new IntegrationActionError(`Unsupported Telegram action: ${action}`);
    const { chatId, text, parseMode } = payload as { chatId: string | number; text: string; parseMode?: string };
    const { status, body } = await fetchJson(this.apiUrl(credentials, 'sendMessage'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: parseMode }),
    });
    if (status !== 200 || (body as { ok?: boolean }).ok !== true) {
      throw new IntegrationActionError(`Telegram sendMessage failed: ${JSON.stringify(body)}`);
    }
    return body;
  }
}
