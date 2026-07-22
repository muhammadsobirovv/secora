import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { WebhookTokenDto } from '@pentesthub/shared';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveWorkspaceMembership } from '../../collaboration/workspace-membership.util.js';
import { toWebhookTokenDto } from '../mappers/to-webhook-token-dto.mapper.js';

export class ListWebhookTokensQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly workspaceId: string,
  ) {}
}

@QueryHandler(ListWebhookTokensQuery)
export class ListWebhookTokensHandler implements IQueryHandler<ListWebhookTokensQuery, WebhookTokenDto[]> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListWebhookTokensQuery): Promise<WebhookTokenDto[]> {
    await resolveWorkspaceMembership(this.prisma, query.userId, query.workspaceId);
    const webhooks = await this.prisma.webhookToken.findMany({
      where: { workspaceId: query.workspaceId },
      orderBy: { createdAt: 'desc' },
    });
    return webhooks.map(toWebhookTokenDto);
  }
}
