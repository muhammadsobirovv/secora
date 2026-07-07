import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type { OAuthExchangeCodesRepository } from '../../../domain/repositories/oauth-exchange-codes.repository.interface.js';
import type { OAuthExchangeCode } from '../../../../../prisma-types.js';

@Injectable()
export class PrismaOAuthExchangeCodesRepository implements OAuthExchangeCodesRepository {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  create(
    userId: string,
    codeHash: string,
    expiresAt: Date,
  ): Promise<OAuthExchangeCode> {
    return this.txHost.tx.oAuthExchangeCode.create({
      data: { userId, codeHash, expiresAt },
    });
  }

  findValidByHash(codeHash: string): Promise<OAuthExchangeCode | null> {
    return this.txHost.tx.oAuthExchangeCode.findFirst({
      where: { codeHash, usedAt: null, expiresAt: { gt: new Date() } },
    });
  }

  async markUsed(id: string): Promise<void> {
    await this.txHost.tx.oAuthExchangeCode.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }
}
