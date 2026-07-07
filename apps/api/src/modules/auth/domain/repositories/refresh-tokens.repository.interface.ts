import type { RefreshToken } from '../../../../prisma-types.js';

export interface CreateRefreshTokenInput {
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
  revoke(id: string): Promise<void>;
  revokeAllForSession(sessionId: string): Promise<void>;
}

export const REFRESH_TOKENS_REPOSITORY = Symbol('REFRESH_TOKENS_REPOSITORY');
