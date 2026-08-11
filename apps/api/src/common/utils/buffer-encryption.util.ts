import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/// AES-256-GCM at-rest encryption for binary payloads (Module 14 —
/// Backup System). Sibling to `credential-encryption.util.ts`, which is
/// string-in/string-out and hex-encodes its ciphertext — a fine choice
/// for a short API key, a poor one for a multi-megabyte gzip'd database
/// dump (hex encoding doubles size for no benefit here). This variant
/// stays entirely in `Buffer`s: the returned buffer is
/// `iv (12 bytes) || authTag (16 bytes) || cipherText`, so a backup
/// archive's encrypted form is exactly one self-contained blob with no
/// separate metadata file needed to decrypt it later.
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;
const AUTH_TAG_LENGTH_BYTES = 16;

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret, 'utf8').digest();
}

export function encryptBuffer(plainText: Buffer, secret: string): Buffer {
  const key = deriveKey(secret);
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]);
}

export function decryptBuffer(cipherBuffer: Buffer, secret: string): Buffer {
  if (cipherBuffer.length < IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES) {
    throw new Error('Malformed encrypted buffer (too short to contain an IV + auth tag).');
  }
  const key = deriveKey(secret);
  const iv = cipherBuffer.subarray(0, IV_LENGTH_BYTES);
  const authTag = cipherBuffer.subarray(IV_LENGTH_BYTES, IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES);
  const data = cipherBuffer.subarray(IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}
