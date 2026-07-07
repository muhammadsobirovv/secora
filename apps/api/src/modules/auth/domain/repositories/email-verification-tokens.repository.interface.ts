import type { EmailVerificationToken } from '../../../../prisma-types.js';

export interface EmailVerificationTokensRepository {
  create(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<EmailVerificationToken>;
  findValidByHash(tokenHash: string): Promise<EmailVerificationToken | null>;
  markUsed(id: string): Promise<void>;
  /// Invalidates prior unused tokens for a user — used by resend so an old
  /// verification link can't still be redeemed after a new one is issued.
  invalidateAllForUser(userId: string): Promise<void>;
}

export const EMAIL_VERIFICATION_TOKENS_REPOSITORY = Symbol(
  'EMAIL_VERIFICATION_TOKENS_REPOSITORY',
);
