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
} from '../../projects/domain/repositories/projects.repository.interface.js';
import {
  TARGETS_REPOSITORY,
  type TargetsRepository,
} from '../domain/repositories/targets.repository.interface.js';
import {
  TAGS_REPOSITORY,
  type TagsRepository,
} from '../../tags/domain/repositories/tags.repository.interface.js';
import { resolveTargetForCaller } from './target-lifecycle.commands.js';

async function resolveTargetAndTag(
  workspacesRepository: WorkspacesRepository,
  projectsRepository: ProjectsRepository,
  targetsRepository: TargetsRepository,
  tagsRepository: TagsRepository,
  userId: string,
  targetId: string,
  tagId: string,
) {
  const { workspaceId } = await resolveTargetForCaller(
    workspacesRepository,
    projectsRepository,
    targetsRepository,
    userId,
    targetId,
  );
  const tag = await tagsRepository.findById(tagId);
  if (!tag || tag.workspaceId !== workspaceId) {
    throw new AppException(
      'TAG_NOT_FOUND',
      'Tag not found.',
      HttpStatus.NOT_FOUND,
    );
  }
}

export class TagTargetCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly targetId: string,
    public readonly tagId: string,
  ) {}
}

@CommandHandler(TagTargetCommand)
export class TagTargetHandler implements ICommandHandler<
  TagTargetCommand,
  void
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROJECTS_REPOSITORY)
    private readonly projectsRepository: ProjectsRepository,
    @Inject(TARGETS_REPOSITORY)
    private readonly targetsRepository: TargetsRepository,
    @Inject(TAGS_REPOSITORY) private readonly tagsRepository: TagsRepository,
  ) {}

  async execute(command: TagTargetCommand): Promise<void> {
    await resolveTargetAndTag(
      this.workspacesRepository,
      this.projectsRepository,
      this.targetsRepository,
      this.tagsRepository,
      command.userId,
      command.targetId,
      command.tagId,
    );
    await this.tagsRepository.tagTarget(command.targetId, command.tagId);
  }
}

export class UntagTargetCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly targetId: string,
    public readonly tagId: string,
  ) {}
}

@CommandHandler(UntagTargetCommand)
export class UntagTargetHandler implements ICommandHandler<
  UntagTargetCommand,
  void
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROJECTS_REPOSITORY)
    private readonly projectsRepository: ProjectsRepository,
    @Inject(TARGETS_REPOSITORY)
    private readonly targetsRepository: TargetsRepository,
    @Inject(TAGS_REPOSITORY) private readonly tagsRepository: TagsRepository,
  ) {}

  async execute(command: UntagTargetCommand): Promise<void> {
    await resolveTargetAndTag(
      this.workspacesRepository,
      this.projectsRepository,
      this.targetsRepository,
      this.tagsRepository,
      command.userId,
      command.targetId,
      command.tagId,
    );
    await this.tagsRepository.untagTarget(command.targetId, command.tagId);
  }
}
