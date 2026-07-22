import { describe, expect, it } from '@jest/globals';
import {
  decryptChannelConfigSecrets,
  encryptChannelConfigSecrets,
} from './notification-channel-config-crypto.util.js';

const KEY = 'a-test-encryption-secret-that-is-long-enough';

describe('encryptChannelConfigSecrets / decryptChannelConfigSecrets', () => {
  it('encrypts a webhook URL so it is not stored as plaintext', () => {
    const config = { webhookUrl: 'https://hooks.example.com/abc123' };
    const encrypted = encryptChannelConfigSecrets(config, KEY);

    expect(encrypted.webhookUrl).not.toBe(config.webhookUrl);
    expect(typeof encrypted.webhookUrl).toBe('string');
    // Ciphertext format: ivHex:authTagHex:cipherTextHex
    expect((encrypted.webhookUrl as string).split(':')).toHaveLength(3);
  });

  it('round-trips a webhook URL through encrypt then decrypt', () => {
    const config = { webhookUrl: 'https://hooks.example.com/abc123' };
    const encrypted = encryptChannelConfigSecrets(config, KEY);
    const decrypted = decryptChannelConfigSecrets(encrypted, KEY);

    expect(decrypted.webhookUrl).toBe(config.webhookUrl);
  });

  it('round-trips botToken and endpoint the same way', () => {
    const config = { botToken: '123456:AAExampleTelegramToken', chatId: '-100999' };
    const roundTripped = decryptChannelConfigSecrets(
      encryptChannelConfigSecrets(config, KEY),
      KEY,
    );
    expect(roundTripped.botToken).toBe(config.botToken);
    // chatId is not a secret key — passes through untouched.
    expect(roundTripped.chatId).toBe(config.chatId);
  });

  it('encrypts each header value individually and round-trips them', () => {
    const config = {
      endpoint: 'https://api.example.com/notify',
      headers: { Authorization: 'Bearer secret-token', 'X-Custom': 'not-secret-either' },
    };
    const encrypted = encryptChannelConfigSecrets(config, KEY);
    const headers = encrypted.headers as Record<string, string>;

    expect(headers.Authorization).not.toBe('Bearer secret-token');
    expect(headers['X-Custom']).not.toBe('not-secret-either');

    const decrypted = decryptChannelConfigSecrets(encrypted, KEY);
    const decryptedHeaders = decrypted.headers as Record<string, string>;
    expect(decryptedHeaders.Authorization).toBe('Bearer secret-token');
    expect(decryptedHeaders['X-Custom']).toBe('not-secret-either');
  });

  it('leaves non-secret keys untouched', () => {
    const config = { chatId: '-100999', enabled: true };
    const encrypted = encryptChannelConfigSecrets(config, KEY);
    expect(encrypted).toEqual(config);
  });

  it('leaves empty-string or missing secret fields alone', () => {
    const config = { webhookUrl: '' };
    const encrypted = encryptChannelConfigSecrets(config, KEY);
    expect(encrypted.webhookUrl).toBe('');
  });

  it('decrypting a value that was never encrypted falls back to the original rather than throwing', () => {
    const alreadyPlaintext = { webhookUrl: 'https://not-actually-ciphertext.example.com' };
    expect(() => decryptChannelConfigSecrets(alreadyPlaintext, KEY)).not.toThrow();
    const result = decryptChannelConfigSecrets(alreadyPlaintext, KEY);
    expect(result.webhookUrl).toBe(alreadyPlaintext.webhookUrl);
  });

  it('produces different ciphertext for the same plaintext on repeated calls (random IV per encryption)', () => {
    const config = { webhookUrl: 'https://hooks.example.com/abc123' };
    const first = encryptChannelConfigSecrets(config, KEY);
    const second = encryptChannelConfigSecrets(config, KEY);
    expect(first.webhookUrl).not.toBe(second.webhookUrl);
  });
});
