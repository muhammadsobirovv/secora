import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type {
  AuditRepository,
  RecordAuditEventInput,
} from '../../../domain/audit.repository.interface.js';
import type { AuditEvent, Prisma } from '../../../../../prisma-types.js';
import { getRequestId } from '../../../../../observability/request-context.js';

@Injectable()
export class PrismaAuditRepository implements AuditRepository {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  async record(input: RecordAuditEventInput): Promise<void> {
    // Module 18 — task #505. Default from the active request's correlation
    // id when the caller didn't supply one explicitly — see
    // RecordAuditEventInput.requestId's doc comment. undefined outside an
    // HTTP request context (e.g. a background job writing its own audit
    // trail), which is fine: the column is nullable for exactly that case.
    await this.txHost.tx.auditEvent.create({
      data: {
        userId: input.userId,
        type: input.type,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
        requestId: input.requestId ?? getRequestId(),
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
