import {
  CommandHandler,
  EventBus,
  ICommand,
  ICommandHandler,
} from '@nestjs/cqrs';
import { Inject, HttpStatus } from '@nestjs/common';
import type { CreateProjectRequestDto, ProjectDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  PROJECTS_REPOSITORY,
  type ProjectsRepository,
} from '../domain/repositories/projects.repository.interface.js';
import { toProjectDto } from '../mappers/to-project-dto.mapper.js';
import { ProjectCreatedEvent } from '../events/project-events.js';

export class CreateProjectCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly data: CreateProjectRequestDto,
  ) {}
}

@CommandHandler(CreateProjectCommand)
export class CreateProjectHandler implements ICommandHandler<
  CreateProjectCommand,
  ProjectDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROJECTS_REPOSITORY)
    private readonly projectsRepository: ProjectsRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: CreateProjectCommand): Promise<ProjectDto> {
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

    const project = await this.projectsRepository.create({
      workspaceId: workspace.id,
      name: command.data.name,
      description: command.data.description,
      status: command.data.status,
      visibility: command.data.visibility,
      createdBy: command.userId,
    });

    this.eventBus.publish(
      new ProjectCreatedEvent(workspace.id, project.id, command.userId),
    );

    const withTags = await this.projectsRepository.findById(project.id);
    return toProjectDto(withTags!, false);
  }
}
