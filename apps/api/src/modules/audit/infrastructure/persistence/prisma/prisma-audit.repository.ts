import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type {
  AuditRepository,
  RecordAuditEventInput,
} from '../../../domain/audit.repository.interface.js';
import type { AuditEvent, Prisma } from '../../../../../prisma-types.js';

@Injectable()
export class PrismaAuditRepository implements AuditRepository {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  async record(input: RecordAuditEventInput): Promise<void> {
    await this.txHost.tx.auditEvent.create({
      data: {
        userId: input.userId,
        type: input.type,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }

  findRecentByUserId(userId: string, limit: number): Promise<AuditEvent[]> {
    return this.txHost.tx.auditEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
