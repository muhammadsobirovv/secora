import type { RefreshToken } from '../../../../prisma-types.js';

export interface CreateRefreshTokenInput {
  id?: string;
  userId: string;
  sessionId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface RefreshTokensRepository {
  create(input: CreateRefreshTokenInput): Promise<RefreshToken>;
  findByHash(tokenHash: string): Promise<RefreshToken | null>;
  /// Sets revokedAt + replacedByTokenId in one step — the rotation chain
  /// link used to detect reuse of an already-rotated token.
  markRotated(id: string, replacedByTokenId: string): Promise<void>;
  /// Atomically claims a token for rotation: only revokes it if it's still
  /// active (revokedAt IS NULL), in one conditional UPDATE. Returns false if
  /// another concurrent request already rotated (or revoked) it first —
  /// the caller then knows it lost the race and should treat this as reuse,
  /// instead of two concurrent refresh calls both successfully minting a
  /// new token from the same now-stale one.
  rotateIfActive(id: string, replacedByTokenId: string): Promise<boolean>;
  revoke(id: string): Promise<void>;
  revokeAllForSession(sessionId: string): Promise<void>;
}

export const REFRESH_TOKENS_REPOSITORY = Symbol('REFRESH_TOKENS_REPOSITORY');
