import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type {
  CreateRefreshTokenInput,
  RefreshTokensRepository,
} from '../../../domain/repositories/refresh-tokens.repository.interface.js';
import type { RefreshToken } from '../../../../../prisma-types.js';

@Injectable()
export class PrismaRefreshTokensRepository implements RefreshTokensRepository {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  create(input: CreateRefreshTokenInput): Promise<RefreshToken> {
    return this.txHost.tx.refreshToken.create({ data: input });
  }

  findByHash(tokenHash: string): Promise<RefreshToken | null> {
    return this.txHost.tx.refreshToken.findUnique({ where: { tokenHash } });
  }

  async markRotated(id: string, replacedByTokenId: string): Promise<void> {
    await this.txHost.tx.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date(), replacedByTokenId },
    });
  }

  async revoke(id: string): Promise<void> {
    await this.txHost.tx.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForSession(sessionId: string): Promise<void> {
    await this.txHost.tx.refreshToken.updateMany({
      where: { sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
