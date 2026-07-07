import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type { PasswordResetTokensRepository } from '../../../domain/repositories/password-reset-tokens.repository.interface.js';
import type { PasswordResetToken } from '../../../../../prisma-types.js';

@Injectable()
export class PrismaPasswordResetTokensRepository implements PasswordResetTokensRepository {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  create(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<PasswordResetToken> {
    return this.txHost.tx.passwordResetToken.create({
      data: { userId, tokenHash, expiresAt },
    });
  }

  findValidByHash(tokenHash: string): Promise<PasswordResetToken | null> {
    return this.txHost.tx.passwordResetToken.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
    });
  }

  async markUsed(id: string): Promise<void> {
    await this.txHost.tx.passwordResetToken.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }
}
