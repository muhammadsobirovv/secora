import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/// AES-256-GCM at-rest encryption for user-supplied secrets (Local-First
/// Migration Phase 1 — BYOK: AiProviderCredential.encryptedApiKey). The key
/// comes from CREDENTIAL_ENCRYPTION_KEY (env.validation.ts), hashed with
/// SHA-256 to always yield exactly 32 bytes regardless of the operator's
/// chosen secret length/encoding — the same "derive a fixed-size key from
/// an arbitrary operator secret" approach used for JWT signing elsewhere
/// in this codebase, just applied to a symmetric cipher key instead.
///
/// Ciphertext is stored as `${ivHex}:${authTagHex}:${cipherTextHex}` — one
/// self-contained string per row, no separate IV/tag columns needed. A
/// fresh random IV is generated per encryption call (GCM requires a unique
/// IV per encryption under the same key; reusing one would leak the
/// plaintext of two messages via XOR — never cached or derived from the
/// plaintext itself).
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12; // GCM's recommended/most efficient IV length.

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret, 'utf8').digest();
}

export function encryptCredential(plainText: string, secret: string): string {
  const key = deriveKey(secret);
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/// Throws if `cipherText` is malformed or the auth tag doesn't verify
/// (tampered ciphertext, or decrypted with the wrong secret) — callers
/// should treat any decryption failure as "this credential is unusable",
/// never fall back to treating the ciphertext as if it were plaintext.
export function decryptCredential(cipherText: string, secret: string): string {
  const parts = cipherText.split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted credential (expected iv:authTag:cipherText).');
  }
  const [ivHex, authTagHex, dataHex] = parts;
  const key = deriveKey(secret);
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

/// The last 4 characters of a raw key, shown in the settings UI so a user
/// can tell credentials apart without the secret ever being re-displayed
/// (AiProviderCredentialDto exposes only this, never encryptedApiKey).
export function previewCredential(plainText: string): string {
  if (plainText.length <= 4) return '••••';
  return `••••${plainText.slice(-4)}`;
}
