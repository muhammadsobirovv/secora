import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { CollaborationEntityType, ReactionDto, WatcherDto } from '@pentesthub/shared';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveWorkspaceMembership } from '../workspace-membership.util.js';
import { resolveCollaborationEntityWorkspace } from '../collaboration-entity-resolver.util.js';
import { toReactionDto, toWatcherDto } from '../mappers/to-watcher-reaction-dto.mapper.js';

export class ListWatchersQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly entityType: CollaborationEntityType,
    public readonly entityId: string,
  ) {}
}

@QueryHandler(ListWatchersQuery)
export class ListWatchersHandler implements IQueryHandler<ListWatchersQuery, WatcherDto[]> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListWatchersQuery): Promise<WatcherDto[]> {
    const workspaceId = await resolveCollaborationEntityWorkspace(this.prisma, query.entityType, query.entityId);
    await resolveWorkspaceMembership(this.prisma, query.userId, workspaceId);

    const watchers = await this.prisma.watcher.findMany({
      where: { entityType: query.entityType, entityId: query.entityId },
      orderBy: { createdAt: 'asc' },
    });
    return watchers.map(toWatcherDto);
  }
}

/// Am *I* watching this entity? Used by the frontend to render the
/// watch/unwatch toggle state without fetching the full watcher list.
export class GetMyWatchStateQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly entityType: CollaborationEntityType,
    public readonly entityId: string,
  ) {}
}

@QueryHandler(GetMyWatchStateQuery)
export class GetMyWatchStateHandler implements IQueryHandler<GetMyWatchStateQuery, WatcherDto | null> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetMyWatchStateQuery): Promise<WatcherDto | null> {
    const workspaceId = await resolveCollaborationEntityWorkspace(this.prisma, query.entityType, query.entityId);
    await resolveWorkspaceMembership(this.prisma, query.userId, workspaceId);

    const watcher = await this.prisma.watcher.findUnique({
      where: {
        entityType_entityId_userId: { entityType: query.entityType, entityId: query.entityId, userId: query.userId },
      },
    });
    return watcher ? toWatcherDto(watcher) : null;
  }
}

export class ListReactionsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly entityType: CollaborationEntityType,
    public readonly entityId: string,
  ) {}
}

@QueryHandler(ListReactionsQuery)
export class ListReactionsHandler implements IQueryHandler<ListReactionsQuery, ReactionDto[]> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListReactionsQuery): Promise<ReactionDto[]> {
    const workspaceId = await resolveCollaborationEntityWorkspace(this.prisma, query.entityType, query.entityId);
    await resolveWorkspaceMembership(this.prisma, query.userId, workspaceId);

    const reactions = await this.prisma.reaction.findMany({
      where: { entityType: query.entityType, entityId: query.entityId },
      orderBy: { createdAt: 'asc' },
    });
    return reactions.map(toReactionDto);
  }
}
