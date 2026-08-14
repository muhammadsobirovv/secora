import { Module } from '@nestjs/common';
import { SupportController } from './controllers/support.controller.js';
import { CreateSupportTicketHandler } from './commands/create-support-ticket.command.js';
import { ListMySupportTicketsHandler } from './queries/list-my-support-tickets.query.js';
import { SUPPORT_TICKETS_REPOSITORY } from './domain/repositories/support-tickets.repository.interface.js';
import { PrismaSupportTicketsRepository } from './infrastructure/persistence/prisma/prisma-support-tickets.repository.js';

/// Module 15 — task #355. `MailService`/`AuditService` come from the
/// `@Global()` `ProvidersModule`/`AuditModule` — no explicit import
/// needed here, matching every other module that consumes them (see
/// `DemoModule`'s doc comment on the same pattern).
@Module({
  controllers: [SupportController],
  providers: [
    CreateSupportTicketHandler,
    ListMySupportTicketsHandler,
    { provide: SUPPORT_TICKETS_REPOSITORY, useClass: PrismaSupportTicketsRepository },
  ],
})
export class SupportModule {}
