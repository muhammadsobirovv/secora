import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type { MfaRepository } from '../../../domain/repositories/mfa.repository.interface.js';
import type {
  MfaBackupCode,
  MfaChallengeToken,
  MfaFactor,
} from '../../../../../prisma-types.js';

@Injectable()
export class PrismaMfaRepository implements MfaRepository {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  findFactorByUserId(userId: string): Promise<MfaFactor | null> {
    return this.txHost.tx.mfaFactor.findUnique({ where: { userId } });
  }

  createFactor(userId: string, secret: string): Promise<MfaFactor> {
    return this.txHost.tx.mfaFactor.create({ data: { userId, secret } });
  }

  async confirmFactor(id: string): Promise<void> {
    await this.txHost.tx.mfaFactor.update({
      where: { id },
      data: { enabled: true, confirmedAt: new Date() },
    });
  }

  async deleteFactor(id: string): Promise<void> {
    await this.txHost.tx.mfaFactor.delete({ where: { id } });
  }

  async replaceBackupCodes(
    mfaFactorId: string,
    hashedCodes: string[],
  ): Promise<void> {
    await this.txHost.tx.mfaBackupCode.deleteMany({ where: { mfaFactorId } });
    await this.txHost.tx.mfaBackupCode.createMany({
      data: hashedCodes.map((codeHash) => ({ mfaFactorId, codeHash })),
    });
  }

  findUnusedBackupCodeByHash(
    mfaFactorId: string,
    codeHash: string,
  ): Promise<MfaBackupCode | null> {
    return this.txHost.tx.mfaBackupCode.findFirst({
      where: { mfaFactorId, codeHash, usedAt: null },
    });
  }

  async consumeBackupCode(id: string): Promise<void> {
    await this.txHost.tx.mfaBackupCode.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }

  createChallengeToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<MfaChallengeToken> {
    return this.txHost.tx.mfaChallengeToken.create({
      data: { userId, tokenHash, expiresAt },
    });
  }

  findValidChallengeTokenByHash(
    tokenHash: string,
  ): Promise<MfaChallengeToken | null> {
    return this.txHost.tx.mfaChallengeToken.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
    });
  }

  async consumeChallengeToken(id: string): Promise<void> {
    await this.txHost.tx.mfaChallengeToken.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }
}
