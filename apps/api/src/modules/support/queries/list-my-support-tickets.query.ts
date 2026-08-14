import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import type { SupportTicketDto } from '@pentesthub/shared';
import {
  SUPPORT_TICKETS_REPOSITORY,
  type SupportTicketsRepository,
} from '../domain/repositories/support-tickets.repository.interface.js';
import { toSupportTicketDto } from '../mappers/to-support-ticket-dto.mapper.js';

const MAX_TICKETS = 50;

export class ListMySupportTicketsQuery implements IQuery {
  constructor(public readonly email: string) {}
}

/// Module 15 — task #355. Matches by the caller's authenticated account
/// email rather than `userId` — see the repository interface's doc
/// comment for why creation can't reliably populate `userId` given this
/// endpoint's public intake.
@QueryHandler(ListMySupportTicketsQuery)
export class ListMySupportTicketsHandler implements IQueryHandler<ListMySupportTicketsQuery> {
  constructor(
    @Inject(SUPPORT_TICKETS_REPOSITORY)
    private readonly supportTicketsRepository: SupportTicketsRepository,
  ) {}

  async execute(query: ListMySupportTicketsQuery): Promise<SupportTicketDto[]> {
    const tickets = await this.supportTicketsRepository.findByEmail(query.email, MAX_TICKETS);
    return tickets.map(toSupportTicketDto);
  }
}
