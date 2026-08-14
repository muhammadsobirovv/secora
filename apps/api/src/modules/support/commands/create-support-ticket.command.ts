import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CreateSupportTicketRequestDto, SupportTicketDto } from '@pentesthub/shared';
import type { EnvConfig } from '../../../config/env.validation.js';
import { AuditService } from '../../audit/audit.service.js';
import { MAIL_SERVICE } from '../../../common/providers/tokens.js';
import type { MailService } from '../../../common/providers/mail/mail-service.interface.js';
import {
  SUPPORT_TICKETS_REPOSITORY,
  type SupportTicketsRepository,
} from '../domain/repositories/support-tickets.repository.interface.js';
import { toSupportTicketDto } from '../mappers/to-support-ticket-dto.mapper.js';

export class CreateSupportTicketCommand implements ICommand {
  constructor(
    public readonly data: CreateSupportTicketRequestDto,
    /// Null for a logged-out submitter — see the repository interface's
    /// doc comment on why this endpoint is `@Public()` in the first place.
    public readonly userId: string | null,
    public readonly ipAddress: string,
    public readonly userAgent: string,
  ) {}
}

/// Module 15 — task #355. Writes the ticket for audit history / the
/// submitter's own "my tickets" list, then notifies `SUPPORT_INBOX_EMAIL`
/// — the actual triage happens in that inbox, not an in-app admin queue
/// (see the repository interface's doc comment on why: no deployment-
/// wide "platform admin" role exists in this codebase to gate one
/// behind). A submitter also gets a plain confirmation email so they know
/// the request was received even if nobody replies within the hour.
@CommandHandler(CreateSupportTicketCommand)
export class CreateSupportTicketHandler implements ICommandHandler<CreateSupportTicketCommand> {
  constructor(
    @Inject(SUPPORT_TICKETS_REPOSITORY)
    private readonly supportTicketsRepository: SupportTicketsRepository,
    @Inject(MAIL_SERVICE) private readonly mailService: MailService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  async execute(command: CreateSupportTicketCommand): Promise<SupportTicketDto> {
    const { data, userId } = command;

    const ticket = await this.supportTicketsRepository.create({
      userId,
      workspaceId: null,
      email: data.email,
      category: data.category,
      subject: data.subject,
      message: data.message,
      diagnosticsSnapshot: data.diagnosticsSnapshot,
    });

    const inbox = this.configService.get('SUPPORT_INBOX_EMAIL', { infer: true });
    const diagnosticsLines = data.diagnosticsSnapshot
      ? [
          '',
          '--- Diagnostics ---',
          `App version: ${data.diagnosticsSnapshot.appVersion}`,
          `Server version: ${data.diagnosticsSnapshot.serverVersion}`,
          `Server status: ${data.diagnosticsSnapshot.serverStatus}`,
          `Database status: ${data.diagnosticsSnapshot.databaseStatus}`,
          `Round-trip latency: ${data.diagnosticsSnapshot.roundTripMs}ms`,
          `User agent: ${data.diagnosticsSnapshot.userAgent}`,
        ]
      : [];

    await this.mailService.send({
      to: inbox,
      subject: `[Support] (${data.category}) ${data.subject}`,
      text: [
        `Ticket ID: ${ticket.id}`,
        `From: ${data.email}`,
        `Category: ${data.category}`,
        '',
        data.message,
        ...diagnosticsLines,
      ].join('\n'),
    });

    await this.mailService.send({
      to: data.email,
      subject: `We received your request: ${data.subject}`,
      text: `Thanks for reaching out — we've received your support request (ref: ${ticket.id}) and will get back to you at this address soon.`,
    });

    await this.auditService.log({
      userId: userId ?? undefined,
      type: 'SUPPORT_TICKET_CREATED',
      ipAddress: command.ipAddress,
      userAgent: command.userAgent,
      metadata: { ticketId: ticket.id, category: data.category },
    });

    return toSupportTicketDto(ticket);
  }
}
