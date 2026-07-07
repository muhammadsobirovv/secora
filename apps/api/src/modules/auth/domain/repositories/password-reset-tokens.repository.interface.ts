import type { PasswordResetToken } from '../../../../prisma-types.js';

export interface PasswordResetTokensRepository {
  create(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<PasswordResetToken>;
  findValidByHash(tokenHash: string): Promise<PasswordResetToken | null>;
  markUsed(id: string): Promise<void>;
}

export const PASSWORD_RESET_TOKENS_REPOSITORY = Symbol(
  'PASSWORD_RESET_TOKENS_REPOSITORY',
);
