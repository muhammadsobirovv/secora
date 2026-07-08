import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject, HttpStatus } from '@nestjs/common';
import type { ListProjectsQueryDto, ProjectDto } from '@pentesthub/shared';
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

export class ListProjectsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly filter: ListProjectsQueryDto,
  ) {}
}

@QueryHandler(ListProjectsQuery)
export class ListProjectsHandler implements IQueryHandler<
  ListProjectsQuery,
  ProjectDto[]
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROJECTS_REPOSITORY)
    private readonly projectsRepository: ProjectsRepository,
    @Inject(PROJECT_FAVORITES_REPOSITORY)
    private readonly favoritesRepository: ProjectFavoritesRepository,
  ) {}

  async execute(query: ListProjectsQuery): Promise<ProjectDto[]> {
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
    const projects = await this.projectsRepository.list({
      workspaceId: workspace.id,
      status: query.filter.status,
      tagId: query.filter.tagId,
      favoritedByUserId: query.filter.favoritesOnly ? query.userId : undefined,
    });
    const favoritedIds = await this.favoritesRepository.listFavoritedIds(
      projects.map((p) => p.id),
      query.userId,
    );
    return projects.map((project) =>
      toProjectDto(project, favoritedIds.has(project.id)),
    );
  }
}
