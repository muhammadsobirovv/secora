import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { NotificationChannelConfigDto } from '@pentesthub/shared';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveWorkspaceMembership } from '../../collaboration/workspace-membership.util.js';
import { toNotificationChannelConfigDto } from '../mappers/to-channel-config-dto.mapper.js';

export class ListNotificationChannelConfigsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly workspaceId: string,
  ) {}
}

@QueryHandler(ListNotificationChannelConfigsQuery)
export class ListNotificationChannelConfigsHandler
  implements IQueryHandler<ListNotificationChannelConfigsQuery, NotificationChannelConfigDto[]>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListNotificationChannelConfigsQuery): Promise<NotificationChannelConfigDto[]> {
    await resolveWorkspaceMembership(this.prisma, query.userId, query.workspaceId);
    const configs = await this.prisma.notificationChannelConfig.findMany({
      where: { workspaceId: query.workspaceId, userId: query.userId },
      orderBy: { createdAt: 'desc' },
    });
    return configs.map(toNotificationChannelConfigDto);
  }
}
