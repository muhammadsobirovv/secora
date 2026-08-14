import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { SupportTicketDto } from '@pentesthub/shared';
import { Public } from '../../../common/decorators/public.decorator.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { extractRequestContext } from '../../../common/utils/request-context.js';
import { CreateSupportTicketDto } from '../dto/create-support-ticket.dto.js';
import { CreateSupportTicketCommand } from '../commands/create-support-ticket.command.js';
import { ListMySupportTicketsQuery } from '../queries/list-my-support-tickets.query.js';

/// Module 15 — task #355. `POST /support/tickets` is `@Public()` for the
/// same reason `POST /demo/session` is (task #352) — someone locked out
/// of their account is exactly who most needs to reach support without a
/// token. Optionally attaches `user.id` when a valid token happens to be
/// present isn't possible here without new optional-auth guard
/// infrastructure this codebase doesn't have (see the domain interface's
/// doc comment) — so `userId` is only ever populated when this route is
/// hit while genuinely authenticated, which `@Public()` bypasses
/// entirely. `GET /support/tickets/mine` is the authenticated
/// counterpart, matching by account email.
@ApiTags('support')
@Controller('support/tickets')
export class SupportController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Public()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  @ApiOperation({ summary: 'Submit a support request — no account required' })
  create(@Body() dto: CreateSupportTicketDto, @Req() req: Request): Promise<SupportTicketDto> {
    const { ipAddress, userAgent } = extractRequestContext(req);
    return this.commandBus.execute(new CreateSupportTicketCommand(dto, null, ipAddress, userAgent));
  }

  @ApiBearerAuth()
  @Get('mine')
  @ApiOperation({ summary: "List the caller's own support tickets" })
  listMine(@CurrentUser() user: RequestUser): Promise<SupportTicketDto[]> {
    return this.queryBus.execute(new ListMySupportTicketsQuery(user.email));
  }
}
