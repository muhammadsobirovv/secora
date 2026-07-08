import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject, HttpStatus } from '@nestjs/common';
import type { WorkspaceMemberDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../domain/repositories/workspaces.repository.interface.js';

export class ListWorkspaceMembersQuery implements IQuery {
  constructor(public readonly userId: string) {}
}

@QueryHandler(ListWorkspaceMembersQuery)
export class ListWorkspaceMembersHandler implements IQueryHandler<
  ListWorkspaceMembersQuery,
  WorkspaceMemberDto[]
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
  ) {}

  async execute(
    query: ListWorkspaceMembersQuery,
  ): Promise<WorkspaceMemberDto[]> {
    const workspace =
      await this.workspacesRepository.findPersonalWorkspaceForUser(
        query.userId,
      );
    if (!workspace) {
      throw new AppException(
        'WORKSPACE_NOT_FOUND',
        'Workspace not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    const members = await this.workspacesRepository.listMembers(workspace.id);
    return members.map((m) => ({
      userId: m.userId,
      role: m.role,
      joinedAt: m.joinedAt.toISOString(),
    }));
  }
}
