import {
  decryptCredential,
  encryptCredential,
} from '../../common/utils/credential-encryption.util.js';

/// `NotificationChannelConfig.config` is a `Json` column holding one of
/// the `NotificationChannelConfigPayload` shapes (@pentesthub/shared) —
/// webhook URLs, bot tokens, custom-API endpoints/headers. These are
/// secrets exactly like `AiProviderCredential.encryptedApiKey` or
/// `WebhookToken.secret`, so they go through the same AES-256-GCM
/// encryption service (`common/utils/credential-encryption.util.ts`)
/// rather than sitting in the database as plaintext JSON — encrypting
/// the individual secret-bearing string values in place (not the whole
/// JSON blob) so the shape stays introspectable for the redaction mapper
/// (`to-channel-config-dto.mapper.ts`'s `SECRET_KEYS` list) without
/// needing to decrypt first just to know which keys to hide.
const SECRET_STRING_KEYS = ['webhookUrl', 'botToken', 'endpoint'] as const;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function encryptChannelConfigSecrets(
  config: Record<string, unknown>,
  encryptionKey: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...config };

  for (const key of SECRET_STRING_KEYS) {
    if (isNonEmptyString(result[key])) {
      result[key] = encryptCredential(result[key] as string, encryptionKey);
    }
  }

  if (result.headers && typeof result.headers === 'object') {
    const headers = result.headers as Record<string, unknown>;
    const encrypted: Record<string, unknown> = {};
    for (const [headerName, value] of Object.entries(headers)) {
      encrypted[headerName] = isNonEmptyString(value)
        ? encryptCredential(value, encryptionKey)
        : value;
    }
    result.headers = encrypted;
  }

  return result;
}

/// Decryption failures (malformed ciphertext) fall back to the original
/// value rather than throwing — guards against a row that was somehow
/// written before this encryption step existed rather than taking down
/// notification delivery for every other channel in the same fan-out.
export function decryptChannelConfigSecrets(
  config: Record<string, unknown>,
  encryptionKey: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...config };

  for (const key of SECRET_STRING_KEYS) {
    if (isNonEmptyString(result[key])) {
      try {
        result[key] = decryptCredential(result[key] as string, encryptionKey);
      } catch {
        // Leave as-is — see doc comment above.
      }
    }
  }

  if (result.headers && typeof result.headers === 'object') {
    const headers = result.headers as Record<string, unknown>;
    const decrypted: Record<string, unknown> = {};
    for (const [headerName, value] of Object.entries(headers)) {
      if (!isNonEmptyString(value)) {
        decrypted[headerName] = value;
        continue;
      }
      try {
        decrypted[headerName] = decryptCredential(value, encryptionKey);
      } catch {
        decrypted[headerName] = value;
      }
    }
    result.headers = decrypted;
  }

  return result;
}
