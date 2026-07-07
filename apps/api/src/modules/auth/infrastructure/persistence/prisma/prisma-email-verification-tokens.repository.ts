import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type { EmailVerificationTokensRepository } from '../../../domain/repositories/email-verification-tokens.repository.interface.js';
import type { EmailVerificationToken } from '../../../../../prisma-types.js';

@Injectable()
export class PrismaEmailVerificationTokensRepository implements EmailVerificationTokensRepository {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  create(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<EmailVerificationToken> {
    return this.txHost.tx.emailVerificationToken.create({
      data: { userId, tokenHash, expiresAt },
    });
  }

  findValidByHash(tokenHash: string): Promise<EmailVerificationToken | null> {
    return this.txHost.tx.emailVerificationToken.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
    });
  }

  async markUsed(id: string): Promise<void> {
    await this.txHost.tx.emailVerificationToken.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }

  async invalidateAllForUser(userId: string): Promise<void> {
    await this.txHost.tx.emailVerificationToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });
  }
}
