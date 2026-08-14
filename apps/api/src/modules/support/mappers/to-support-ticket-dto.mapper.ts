import type { SupportTicketDto } from '@pentesthub/shared';
import type { SupportTicket } from '../domain/repositories/support-tickets.repository.interface.js';

export function toSupportTicketDto(ticket: SupportTicket): SupportTicketDto {
  return {
    id: ticket.id,
    category: ticket.category,
    subject: ticket.subject,
    message: ticket.message,
    status: ticket.status,
    email: ticket.email,
    diagnosticsSnapshot:
      (ticket.diagnosticsSnapshot as SupportTicketDto['diagnosticsSnapshot']) ?? null,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
  };
}
