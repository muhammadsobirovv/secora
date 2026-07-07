import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type {
  CreateSessionInput,
  SessionsRepository,
} from '../../../domain/repositories/sessions.repository.interface.js';
import type { Session } from '../../../../../prisma-types.js';

@Injectable()
export class PrismaSessionsRepository implements SessionsRepository {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  create(input: CreateSessionInput): Promise<Session> {
    return this.txHost.tx.session.create({ data: input });
  }

  findById(id: string): Promise<Session | null> {
    return this.txHost.tx.session.findUnique({ where: { id } });
  }

  findActiveByUser(userId: string): Promise<Session[]> {
    return this.txHost.tx.session.findMany({
      where: { userId, revokedAt: null },
      orderBy: { lastActiveAt: 'desc' },
    });
  }

  async touchLastActive(id: string): Promise<void> {
    await this.txHost.tx.session.update({
      where: { id },
      data: { lastActiveAt: new Date() },
    });
  }

  async revoke(id: string): Promise<void> {
    await this.txHost.tx.session.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(
    userId: string,
    exceptSessionId?: string,
  ): Promise<void> {
    await this.txHost.tx.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { revokedAt: new Date() },
    });
  }
}
