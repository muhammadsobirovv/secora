import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { AssignmentDto, ListAssignmentsQueryDto } from '@pentesthub/shared';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveWorkspaceMembership } from '../workspace-membership.util.js';
import { toAssignmentDto } from '../mappers/to-assignment-dto.mapper.js';

export class ListAssignmentsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly workspaceId: string,
    public readonly filters: ListAssignmentsQueryDto,
  ) {}
}

@QueryHandler(ListAssignmentsQuery)
export class ListAssignmentsHandler implements IQueryHandler<ListAssignmentsQuery, AssignmentDto[]> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListAssignmentsQuery): Promise<AssignmentDto[]> {
    await resolveWorkspaceMembership(this.prisma, query.userId, query.workspaceId);

    const assignments = await this.prisma.assignment.findMany({
      where: {
        workspaceId: query.workspaceId,
        entityType: query.filters.entityType,
        entityId: query.filters.entityId,
        assigneeId: query.filters.assigneeId,
        status: query.filters.status,
      },
      orderBy: { createdAt: 'desc' },
    });
    return assignments.map(toAssignmentDto);
  }
}
