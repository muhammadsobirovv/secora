import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { ListWorkspaceInvitesQueryDto, WorkspaceInviteDto } from '@pentesthub/shared';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveWorkspaceMembership } from '../workspace-membership.util.js';
import { requireRole } from '../permissions.util.js';
import { toWorkspaceInviteDto } from '../mappers/to-invite-dto.mapper.js';

export class ListWorkspaceInvitesQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly workspaceId: string,
    public readonly filters: ListWorkspaceInvitesQueryDto,
  ) {}
}

@QueryHandler(ListWorkspaceInvitesQuery)
export class ListWorkspaceInvitesHandler
  implements IQueryHandler<ListWorkspaceInvitesQuery, WorkspaceInviteDto[]>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListWorkspaceInvitesQuery): Promise<WorkspaceInviteDto[]> {
    const { role } = await resolveWorkspaceMembership(this.prisma, query.userId, query.workspaceId);
    requireRole(role, 'ADMIN');

    const invites = await this.prisma.workspaceInvite.findMany({
      where: {
        workspaceId: query.workspaceId,
        status: query.filters.status,
      },
      orderBy: { createdAt: 'desc' },
    });
    return invites.map(toWorkspaceInviteDto);
  }
}
