import { createHmac } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../../config/env.validation.js';
import { decryptCredential } from '../../../common/utils/credential-encryption.util.js';

/// Shared by TestWebhookTokenHandler (webhook-tokens.commands.ts) and
/// WebhookDeliveryQueueService — one HMAC-SHA256-over-the-JSON-body
/// signing routine so a synthetic `test` delivery and a real event
/// delivery are indistinguishable to the receiving endpoint's
/// verification code, and so there is exactly one place that decrypts
/// WebhookToken.secret.
export function signWebhookPayload(
  rawSecret: string,
  body: string,
): string {
  return createHmac('sha256', rawSecret).update(body).digest('hex');
}

export function decryptWebhookSecret(
  encryptedSecret: string,
  configService: ConfigService<EnvConfig, true>,
): string {
  const encryptionKey = configService.get('CREDENTIAL_ENCRYPTION_KEY', { infer: true });
  return decryptCredential(encryptedSecret, encryptionKey);
}

/// Normalizes a domain event's (verb, entityType) pair into the
/// canonical webhook event key used both in WEBHOOK_EVENT_TYPES
/// (packages/shared/src/bugbounty-os.ts) and in WebhookToken.events
/// subscriptions. Most of this codebase's domain events already bake
/// the entity name into `verb` (e.g. Target's verb is "target.created"),
/// so those pass through unchanged; a few (plugin events) use a bare
/// verb ("installed") alongside a separate `entityType` ("PLUGIN") —
/// for those this reconstructs the same dotted shape
/// ("plugin.installed") so both conventions produce one consistent
/// catalog instead of leaking the inconsistency into WebhookToken
/// subscriptions.
export function toWebhookEventKey(verb: string, entityType: string): string {
  if (verb.includes('.')) return verb;
  return `${entityType.toLowerCase()}.${verb}`;
}
