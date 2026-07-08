import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject, HttpStatus } from '@nestjs/common';
import type { ProjectMemberDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  PROJECTS_REPOSITORY,
  type ProjectsRepository,
} from '../domain/repositories/projects.repository.interface.js';
import {
  PROJECT_MEMBERS_REPOSITORY,
  type ProjectMembersRepository,
} from '../domain/repositories/project-members.repository.interface.js';

export class ListProjectMembersQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly projectId: string,
  ) {}
}

@QueryHandler(ListProjectMembersQuery)
export class ListProjectMembersHandler implements IQueryHandler<
  ListProjectMembersQuery,
  ProjectMemberDto[]
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROJECTS_REPOSITORY)
    private readonly projectsRepository: ProjectsRepository,
    @Inject(PROJECT_MEMBERS_REPOSITORY)
    private readonly projectMembersRepository: ProjectMembersRepository,
  ) {}

  async execute(query: ListProjectMembersQuery): Promise<ProjectMemberDto[]> {
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
    const project = await this.projectsRepository.findByIdForWorkspace(
      query.projectId,
      workspace.id,
    );
    if (!project) {
      throw new AppException(
        'PROJECT_NOT_FOUND',
        'Project not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    const members = await this.projectMembersRepository.list(query.projectId);
    return members.map((m) => ({
      userId: m.userId,
      role: m.role,
      addedAt: m.addedAt.toISOString(),
    }));
  }
}
