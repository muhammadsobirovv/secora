import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { NotificationChannelConfigDto, TestNotificationChannelResultDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { CreateNotificationChannelConfigDto, UpdateNotificationChannelConfigDto } from '../dto/notification-channel.dto.js';
import {
  CreateNotificationChannelConfigCommand,
  DeleteNotificationChannelConfigCommand,
  TestNotificationChannelConfigCommand,
  UpdateNotificationChannelConfigCommand,
} from '../commands/notification-channel-configs.commands.js';
import { ListNotificationChannelConfigsQuery } from '../queries/notification-channel-configs.query.js';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications/workspaces/:workspaceId/channels')
export class NotificationChannelsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List my notification channel configs (Desktop/Browser/Email/Webhook/Discord/Slack/Telegram/Custom API)' })
  list(@Param('workspaceId') workspaceId: string, @CurrentUser() user: RequestUser): Promise<NotificationChannelConfigDto[]> {
    return this.queryBus.execute(new ListNotificationChannelConfigsQuery(user.id, workspaceId));
  }

  @Post()
  @ApiOperation({ summary: 'Configure a notification channel' })
  create(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateNotificationChannelConfigDto,
    @CurrentUser() user: RequestUser,
  ): Promise<NotificationChannelConfigDto> {
    return this.commandBus.execute(new CreateNotificationChannelConfigCommand(user.id, workspaceId, dto));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a notification channel config' })
  update(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Body() dto: UpdateNotificationChannelConfigDto,
    @CurrentUser() user: RequestUser,
  ): Promise<NotificationChannelConfigDto> {
    return this.commandBus.execute(new UpdateNotificationChannelConfigCommand(user.id, workspaceId, id, dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a notification channel config' })
  async remove(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.commandBus.execute(new DeleteNotificationChannelConfigCommand(user.id, workspaceId, id));
  }

  @Post(':id/test')
  @ApiOperation({ summary: 'Send a test notification through this channel' })
  test(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<TestNotificationChannelResultDto> {
    return this.commandBus.execute(new TestNotificationChannelConfigCommand(user.id, workspaceId, id));
  }
}
