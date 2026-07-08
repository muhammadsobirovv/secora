import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject, HttpStatus } from '@nestjs/common';
import type { ProjectDto } from '@pentesthub/shared';
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
  PROJECT_FAVORITES_REPOSITORY,
  type ProjectFavoritesRepository,
} from '../domain/repositories/project-favorites.repository.interface.js';
import { toProjectDto } from '../mappers/to-project-dto.mapper.js';

export class GetProjectQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly projectId: string,
  ) {}
}

@QueryHandler(GetProjectQuery)
export class GetProjectHandler implements IQueryHandler<
  GetProjectQuery,
  ProjectDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROJECTS_REPOSITORY)
    private readonly projectsRepository: ProjectsRepository,
    @Inject(PROJECT_FAVORITES_REPOSITORY)
    private readonly favoritesRepository: ProjectFavoritesRepository,
  ) {}

  async execute(query: GetProjectQuery): Promise<ProjectDto> {
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
    const isFavorite = await this.favoritesRepository.isFavorite(
      query.projectId,
      query.userId,
    );
    return toProjectDto(project, isFavorite);
  }
}
