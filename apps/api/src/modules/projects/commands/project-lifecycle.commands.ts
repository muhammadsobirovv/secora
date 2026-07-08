import {
  CommandHandler,
  EventBus,
  ICommand,
  ICommandHandler,
} from '@nestjs/cqrs';
import { Inject, HttpStatus } from '@nestjs/common';
import type { ProjectDto } from '@pentesthub/shared';
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
import {
  ProjectArchivedEvent,
  ProjectDeletedEvent,
  ProjectFavoritedEvent,
  ProjectRestoredEvent,
} from '../events/project-events.js';

/// Archive/restore/soft-delete/favorite/unfavorite share the exact same
/// "resolve workspace, resolve project, mutate, return DTO" shape — one
/// file for all five keeps that shape visible instead of scattering it
/// across five near-identical files.

async function resolveWorkspaceAndProject(
  workspacesRepository: WorkspacesRepository,
  projectsRepository: ProjectsRepository,
  userId: string,
  projectId: string,
  { includeDeleted = false }: { includeDeleted?: boolean } = {},
) {
  const workspace =
    await workspacesRepository.findPersonalWorkspaceForUser(userId);
  if (!workspace) {
    throw new AppException(
      'WORKSPACE_NOT_FOUND',
      'Workspace not found.',
      HttpStatus.NOT_FOUND,
    );
  }
  const project = includeDeleted
    ? await projectsRepository.findByIdIncludingDeleted(projectId)
    : await projectsRepository.findByIdForWorkspace(projectId, workspace.id);
  if (!project || project.workspaceId !== workspace.id) {
    throw new AppException(
      'PROJECT_NOT_FOUND',
      'Project not found.',
      HttpStatus.NOT_FOUND,
    );
  }
  return { workspace, project };
}

// --- Archive -----------------------------------------------------------

export class ArchiveProjectCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly projectId: string,
  ) {}
}

@CommandHandler(ArchiveProjectCommand)
export class ArchiveProjectHandler implements ICommandHandler<
  ArchiveProjectCommand,
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

  async execute(command: ArchiveProjectCommand): Promise<ProjectDto> {
    const { workspace } = await resolveWorkspaceAndProject(
      this.workspacesRepository,
      this.projectsRepository,
      command.userId,
      command.projectId,
    );
    await this.projectsRepository.archive(command.projectId);
    this.eventBus.publish(
      new ProjectArchivedEvent(workspace.id, command.projectId, command.userId),
    );
    const updated = await this.projectsRepository.findById(command.projectId);
    const isFavorite = await this.favoritesRepository.isFavorite(
      command.projectId,
      command.userId,
    );
    return toProjectDto(updated!, isFavorite);
  }
}

// --- Restore (undo soft delete) -----------------------------------------

export class RestoreProjectCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly projectId: string,
  ) {}
}

@CommandHandler(RestoreProjectCommand)
export class RestoreProjectHandler implements ICommandHandler<
  RestoreProjectCommand,
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

  async execute(command: RestoreProjectCommand): Promise<ProjectDto> {
    const { workspace } = await resolveWorkspaceAndProject(
      this.workspacesRepository,
      this.projectsRepository,
      command.userId,
      command.projectId,
      { includeDeleted: true },
    );
    await this.projectsRepository.restore(command.projectId);
    this.eventBus.publish(
      new ProjectRestoredEvent(workspace.id, command.projectId, command.userId),
    );
    const updated = await this.projectsRepository.findById(command.projectId);
    const isFavorite = await this.favoritesRepository.isFavorite(
      command.projectId,
      command.userId,
    );
    return toProjectDto(updated!, isFavorite);
  }
}

// --- Delete (soft) -------------------------------------------------------

export class DeleteProjectCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly projectId: string,
  ) {}
}

@CommandHandler(DeleteProjectCommand)
export class DeleteProjectHandler implements ICommandHandler<
  DeleteProjectCommand,
  void
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROJECTS_REPOSITORY)
    private readonly projectsRepository: ProjectsRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: DeleteProjectCommand): Promise<void> {
    const { workspace } = await resolveWorkspaceAndProject(
      this.workspacesRepository,
      this.projectsRepository,
      command.userId,
      command.projectId,
    );
    await this.projectsRepository.softDelete(command.projectId);
    this.eventBus.publish(
      new ProjectDeletedEvent(workspace.id, command.projectId, command.userId),
    );
  }
}

// --- Favorite / unfavorite -----------------------------------------------

export class FavoriteProjectCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly projectId: string,
  ) {}
}

@CommandHandler(FavoriteProjectCommand)
export class FavoriteProjectHandler implements ICommandHandler<
  FavoriteProjectCommand,
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

  async execute(command: FavoriteProjectCommand): Promise<ProjectDto> {
    const { workspace } = await resolveWorkspaceAndProject(
      this.workspacesRepository,
      this.projectsRepository,
      command.userId,
      command.projectId,
    );
    await this.favoritesRepository.add(command.projectId, command.userId);
    this.eventBus.publish(
      new ProjectFavoritedEvent(
        workspace.id,
        command.projectId,
        command.userId,
      ),
    );
    const updated = await this.projectsRepository.findById(command.projectId);
    return toProjectDto(updated!, true);
  }
}

export class UnfavoriteProjectCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly projectId: string,
  ) {}
}

@CommandHandler(UnfavoriteProjectCommand)
export class UnfavoriteProjectHandler implements ICommandHandler<
  UnfavoriteProjectCommand,
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

  async execute(command: UnfavoriteProjectCommand): Promise<ProjectDto> {
    await resolveWorkspaceAndProject(
      this.workspacesRepository,
      this.projectsRepository,
      command.userId,
      command.projectId,
    );
    await this.favoritesRepository.remove(command.projectId, command.userId);
    const updated = await this.projectsRepository.findById(command.projectId);
    return toProjectDto(updated!, false);
  }
}
