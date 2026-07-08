import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { Inject, HttpStatus } from '@nestjs/common';
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
  TAGS_REPOSITORY,
  type TagsRepository,
} from '../../tags/domain/repositories/tags.repository.interface.js';

async function resolveWorkspaceProjectAndTag(
  workspacesRepository: WorkspacesRepository,
  projectsRepository: ProjectsRepository,
  tagsRepository: TagsRepository,
  userId: string,
  projectId: string,
  tagId: string,
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
  const project = await projectsRepository.findByIdForWorkspace(
    projectId,
    workspace.id,
  );
  if (!project) {
    throw new AppException(
      'PROJECT_NOT_FOUND',
      'Project not found.',
      HttpStatus.NOT_FOUND,
    );
  }
  const tag = await tagsRepository.findById(tagId);
  if (!tag || tag.workspaceId !== workspace.id) {
    throw new AppException(
      'TAG_NOT_FOUND',
      'Tag not found.',
      HttpStatus.NOT_FOUND,
    );
  }
}

export class TagProjectCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly projectId: string,
    public readonly tagId: string,
  ) {}
}

@CommandHandler(TagProjectCommand)
export class TagProjectHandler implements ICommandHandler<
  TagProjectCommand,
  void
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROJECTS_REPOSITORY)
    private readonly projectsRepository: ProjectsRepository,
    @Inject(TAGS_REPOSITORY) private readonly tagsRepository: TagsRepository,
  ) {}

  async execute(command: TagProjectCommand): Promise<void> {
    await resolveWorkspaceProjectAndTag(
      this.workspacesRepository,
      this.projectsRepository,
      this.tagsRepository,
      command.userId,
      command.projectId,
      command.tagId,
    );
    await this.tagsRepository.tagProject(command.projectId, command.tagId);
  }
}

export class UntagProjectCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly projectId: string,
    public readonly tagId: string,
  ) {}
}

@CommandHandler(UntagProjectCommand)
export class UntagProjectHandler implements ICommandHandler<
  UntagProjectCommand,
  void
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROJECTS_REPOSITORY)
    private readonly projectsRepository: ProjectsRepository,
    @Inject(TAGS_REPOSITORY) private readonly tagsRepository: TagsRepository,
  ) {}

  async execute(command: UntagProjectCommand): Promise<void> {
    await resolveWorkspaceProjectAndTag(
      this.workspacesRepository,
      this.projectsRepository,
      this.tagsRepository,
      command.userId,
      command.projectId,
      command.tagId,
    );
    await this.tagsRepository.untagProject(command.projectId, command.tagId);
  }
}
