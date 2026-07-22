import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { ActivityFeedItemDto, ListActivityFeedQueryDto } from '@pentesthub/shared';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveWorkspaceMembership } from '../workspace-membership.util.js';

/// Read-through over the existing `ActivityEvent` table (Modules 1/2) —
/// every module from Recon through Bug Bounty already writes to it on
/// meaningful state changes (job created, finding stage changed, report
/// submitted, ...), so the spec's "Activity Feed" requirement is a query,
/// not a new write path. No new storage; see `docs/adr/
/// 0009-bug-bounty-operating-system.md` for why Module 9 reuses this
/// instead of introducing a parallel feed table.
export class ListActivityFeedQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly workspaceId: string,
    public readonly filters: ListActivityFeedQueryDto,
  ) {}
}

@QueryHandler(ListActivityFeedQuery)
export class ListActivityFeedHandler implements IQueryHandler<ListActivityFeedQuery, ActivityFeedItemDto[]> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListActivityFeedQuery): Promise<ActivityFeedItemDto[]> {
    await resolveWorkspaceMembership(this.prisma, query.userId, query.workspaceId);

    const events = await this.prisma.activityEvent.findMany({
      where: {
        workspaceId: query.workspaceId,
        projectId: query.filters.projectId,
        entityType: query.filters.entityType,
        entityId: query.filters.entityId,
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(query.filters.limit ?? 50, 200),
    });

    return events.map((e) => ({
      id: e.id,
      actorUserId: e.actorUserId,
      verb: e.verb,
      entityType: e.entityType,
      entityId: e.entityId,
      metadata: (e.metadata as Record<string, unknown> | null) ?? null,
      createdAt: e.createdAt.toISOString(),
    }));
  }
}
