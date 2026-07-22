import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { HttpStatus } from '@nestjs/common';
import type { ListWebhookDeliveriesQueryDto, WebhookDeliveryDto } from '@pentesthub/shared';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { resolveWorkspaceMembership } from '../../collaboration/workspace-membership.util.js';
import { toWebhookDeliveryDto } from '../mappers/to-webhook-delivery-dto.mapper.js';

export class ListWebhookDeliveriesQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly workspaceId: string,
    public readonly webhookId: string,
    public readonly filter: ListWebhookDeliveriesQueryDto,
  ) {}
}

@QueryHandler(ListWebhookDeliveriesQuery)
export class ListWebhookDeliveriesHandler
  implements IQueryHandler<ListWebhookDeliveriesQuery, WebhookDeliveryDto[]>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListWebhookDeliveriesQuery): Promise<WebhookDeliveryDto[]> {
    await resolveWorkspaceMembership(this.prisma, query.userId, query.workspaceId);

    const webhook = await this.prisma.webhookToken.findFirst({
      where: { id: query.webhookId, workspaceId: query.workspaceId },
    });
    if (!webhook) {
      throw new AppException('WEBHOOK_TOKEN_NOT_FOUND', 'Webhook not found.', HttpStatus.NOT_FOUND);
    }

    const deliveries = await this.prisma.webhookDelivery.findMany({
      where: {
        webhookTokenId: webhook.id,
        ...(query.filter.status ? { status: query.filter.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(query.filter.limit ?? 50, 200),
    });
    return deliveries.map(toWebhookDeliveryDto);
  }
}
