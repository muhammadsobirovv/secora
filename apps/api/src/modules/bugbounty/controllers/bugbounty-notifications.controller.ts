import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { BugBountyNotificationDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { ListNotificationsQueryParamsDto } from '../dto/notification.dto.js';
import {
  MarkAllNotificationsReadCommand,
  MarkNotificationReadCommand,
} from '../commands/notification.commands.js';
import { ListNotificationsQuery } from '../queries/list-notifications.query.js';

/// `read-all` is declared before `:id/read` so it isn't swallowed by the
/// parameterized route.
@ApiTags('bugbounty')
@ApiBearerAuth()
@Controller('bugbounty/notifications')
export class BugBountyNotificationsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List my notifications' })
  list(
    @Query() query: ListNotificationsQueryParamsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<BugBountyNotificationDto[]> {
    return this.queryBus.execute(new ListNotificationsQuery(user.id, query));
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Mark all my notifications as read' })
  markAllRead(@CurrentUser() user: RequestUser): Promise<{ count: number }> {
    return this.commandBus.execute(
      new MarkAllNotificationsReadCommand(user.id),
    );
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Mark a notification as read' })
  markRead(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<BugBountyNotificationDto> {
    return this.commandBus.execute(
      new MarkNotificationReadCommand(u