import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { ListTaskItemsQueryDto, TaskItemDto } from '@pentesthub/shared';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveWorkspaceMembership } from '../workspace-membership.util.js';
import { toTaskItemDto } from '../mappers/to-task-item-dto.mapper.js';

export class ListTaskItemsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly workspaceId: string,
    public readonly filters: ListTaskItemsQueryDto,
  ) {}
}

@QueryHandler(ListTaskItemsQuery)
export class ListTaskItemsHandler implements IQueryHandler<ListTaskItemsQuery, TaskItemDto[]> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListTaskItemsQuery): Promise<TaskItemDto[]> {
    await resolveWorkspaceMembership(this.prisma, query.userId, query.workspaceId);

    const tasks = await this.prisma.taskItem.findMany({
      where: {
        workspaceId: query.workspaceId,
        projectId: query.filters.projectId,
        assigneeId: query.filters.assigneeId,
        done: query.filters.done,
        deletedAt: null,
      },
      orderBy: [{ done: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
    });
    return tasks.map(toTaskItemDto);
  }
}
