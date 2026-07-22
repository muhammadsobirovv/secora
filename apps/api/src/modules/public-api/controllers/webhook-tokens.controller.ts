import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { TestWebhookTokenResultDto, WebhookDeliveryDto, WebhookDeliveryStatus, WebhookTokenDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { CreateWebhookTokenDto, UpdateWebhookTokenDto } from '../dto/public-api.dto.js';
import {
  CreateWebhookTokenCommand,
  DeleteWebhookTokenCommand,
  TestWebhookTokenCommand,
  UpdateWebhookTokenCommand,
} from '../commands/webhook-tokens.commands.js';
import { RedeliverWebhookDeliveryCommand } from '../commands/webhook-deliveries.commands.js';
import { ListWebhookTokensQuery } from '../queries/webhook-tokens.query.js';
import { ListWebhookDeliveriesQuery } from '../queries/webhook-deliveries.query.js';

@ApiTags('public-api')
@ApiBearerAuth()
@Controller('public-api/workspaces/:workspaceId/webhooks')
export class WebhookTokensController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List outbound webhook registrations for a workspace' })
  list(@Param('workspaceId') workspaceId: string, @CurrentUser() user: RequestUser): Promise<WebhookTokenDto[]> {
    return this.queryBus.execute(new ListWebhookTokensQuery(user.id, workspaceId));
  }

  @Post()
  @ApiOperation({ summary: 'Register an outbound webhook (Manager+)' })
  create(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateWebhookTokenDto,
    @CurrentUser() user: RequestUser,
  ): Promise<WebhookTokenDto> {
    return this.commandBus.execute(new CreateWebhookTokenCommand(user.id, workspaceId, dto));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a webhook registration (Manager+)' })
  update(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Body() dto: UpdateWebhookTokenDto,
    @CurrentUser() user: RequestUser,
  ): Promise<WebhookTokenDto> {
    return this.commandBus.execute(new UpdateWebhookTokenCommand(user.id, workspaceId, id, dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a webhook registration (Manager+)' })
  async remove(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.commandBus.execute(new DeleteWebhookTokenCommand(user.id, workspaceId, id));
  }

  @Post(':id/test')
  @ApiOperation({ summary: 'Send a signed test payload to confirm the endpoint is reachable' })
  test(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<TestWebhookTokenResultDto> {
    return this.commandBus.execute(new TestWebhookTokenCommand(user.id, workspaceId, id));
  }

  @Get(':id/deliveries')
  @ApiOperation({ summary: 'List real event deliveries for a webhook (Module 10)' })
  listDeliveries(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Query('status') status?: WebhookDeliveryStatus,
    @Query('limit') limit?: string,
  ): Promise<WebhookDeliveryDto[]> {
    return this.queryBus.execute(
      new ListWebhookDeliveriesQuery(user.id, workspaceId, id, {
        status,
        limit: limit ? Number(limit) : undefined,
      }),
    );
  }

  @Post(':id/deliveries/:deliveryId/redeliver')
  @ApiOperation({ summary: 'Re-queue a FAILED/DEAD_LETTER delivery for another attempt (Manager+)' })
  redeliver(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Param('deliveryId') deliveryId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<WebhookDeliveryDto> {
    return this.commandBus.execute(new RedeliverWebhookDeliveryCommand(user.id, workspaceId, id, deliveryId));
  }
}
