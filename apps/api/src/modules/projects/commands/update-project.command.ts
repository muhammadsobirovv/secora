import {
  CommandHandler,
  EventBus,
  ICommand,
  ICommandHandler,
} from '@nestjs/cqrs';
import { Inject, HttpStatus } from '@nestjs/common';
import type { ProjectDto, UpdateProjectRequestDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  PROJECT_FAVORITES_REPOSITORY,
  type ProjectFavoritesRepository,
} from '../domain/repositories/project-favorites.repository.interface.js';
import {
  PROJECTS_REPOSITORY,
  type ProjectsRepository,
} from '../domain/repositories/projects.repository.interface.js';
import { toProjectDto } from '../mappers/to-project-dto.mapper.js';
import { ProjectUpdatedEvent } from '../events/project-events.js';

export class UpdateProjectCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly projectId: string,
    public readonly data: UpdateProjectRequestDto,
  ) {}
}

@CommandHandler(UpdateProjectCommand)
export class UpdateProjectHandler implements ICommandHandler<
  UpdateProjectCommand,
  ProjectDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROJECTS_REPOSITORY)
    private readonly projectsRepository: ProjectsRepository,
    @Inject(PROJECT_FAVORITES_REPOSITORY)
    private readonly favoritesRepository: ProjectFavoritesRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: UpdateProjectCommand): Promise<ProjectDto> {
    const workspace =
      await this.workspacesRepository.findPersonalWorkspaceForUser(
        command.userId,
      );
    if (!workspace) {
      throw new AppException(
        'WORKSPACE_NOT_FOUND',
        'Workspace not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    const existing = await this.projectsRepository.findByIdForWorkspace(
      command.projectId,
      workspace.id,
    );
    if (!existing) {
      throw new AppException(
        'PROJECT_NOT_FOUND',
        'Project not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    await this.projectsRepository.update(command.projectId, command.data);

    this.eventBus.publish(
      new ProjectUpdatedEvent(workspace.id, command.projectId, command.userId),
    );

    const updated = await this.projectsRepository.findById(command.projectId);
    const isFavorite = await this.favoritesRepository.isFavorite(
      command.projectId,
      command.userId,
    );
    return toProjectDto(updated!, isFavorite);
  }
}
