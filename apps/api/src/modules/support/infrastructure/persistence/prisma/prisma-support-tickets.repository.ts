import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type {
  CreateSupportTicketInput,
  SupportTicket,
  SupportTicketsRepository,
} from '../../../domain/repositories/support-tickets.repository.interface.js';

/// Module 15 — task #355. Talks to `this.txHost.tx.supportTicket` — only
/// resolvable once `npx prisma generate` has been run against the
/// `SupportTicket` model added to `schema.prisma` this task (see the
/// domain interface's doc comment for why that couldn't happen inside
/// this sandbox).
@Injectable()
export class PrismaSupportTicketsRepository implements SupportTicketsRepository {
  constructor(private readonly txHost: TransactionHost<AppTransactionalAdapter>) {}

  create(input: CreateSupportTicketInput): Promise<SupportTicket> {
    return this.txHost.tx.supportTicket.create({
      data: {
        userId: input.userId,
        workspaceId: input.workspaceId,
        email: input.email,
        category: input.category,
        subject: input.subject,
        message: input.message,
        diagnosticsSnapshot: input.diagnosticsSnapshot ?? undefined,
      },
    }) as unknown as Promise<SupportTicket>;
  }

  findByEmail(email: string, take: number): Promise<SupportTicket[]> {
    return this.txHost.tx.supportTicket.findMany({
      where: { email },
      orderBy: { createdAt: 'desc' },
      take,
    }) as unknown as Promise<SupportTicket[]>;
  }
}
