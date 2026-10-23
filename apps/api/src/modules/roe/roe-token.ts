import { createHash, randomBytes } from 'node:crypto';

/// Approval and revoke links carry a random 256-bit token. Only its SHA-256 is
/// stored, so a database leak does not yield working links; the token is long
/// and random, so an unsalted hash cannot be brute-forced.
export const ROE_TOKEN_PREFIX = 'roe_';

export function generateRoeToken(): string {
  return `${ROE_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
}

export function hashRoeToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/// Cheap shape check before touching the database, so garbage never costs a query.
export function looksLikeRoeToken(token: unknown): token is string {
  return typeof token === 'string' && /^roe_[A-Za-z0-9_-]{43}$/.test(token);
}
