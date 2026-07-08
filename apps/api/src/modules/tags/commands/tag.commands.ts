import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { Inject, HttpStatus } from '@nestjs/common';
import type { CreateTagRequestDto, TagDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  TAGS_REPOSITORY,
  type TagsRepository,
} from '../domain/repositories/tags.repository.interface.js';

function toTagDto(tag: {
  id: string;
  workspaceId: string;
  name: string;
  color: string | null;
  createdAt: Date;
}): TagDto {
  return {
    id: tag.id,
    workspaceId: tag.workspaceId,
    name: tag.name,
    color: tag.color,
    createdAt: tag.createdAt.toISOString(),
  };
}

export class CreateTagCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly data: CreateTagRequestDto,
  ) {}
}

@CommandHandler(CreateTagCommand)
export class CreateTagHandler implements ICommandHandler<
  CreateTagCommand,
  TagDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(TAGS_REPOSITORY) private readonly tagsRepository: TagsRepository,
  ) {}

  async execute(command: CreateTagCommand): Promise<TagDto> {
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
    const existing = await this.tagsRepository.findByWorkspaceAndName(
      workspace.id,
      command.data.name,
    );
    if (existing) {
      throw new AppException(
        'TAG_ALREADY_EXISTS',
        'A tag with this name already exists.',
        HttpStatus.CONFLICT,
      );
    }
    const tag = await this.tagsRepository.create({
      workspaceId: workspace.id,
      name: command.data.name,
      color: command.data.color,
    });
    return toTagDto(tag);
  }
}

export class DeleteTagCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly tagId: string,
  ) {}
}

@CommandHandler(DeleteTagCommand)
export class DeleteTagHandler implements ICommandHandler<
  DeleteTagCommand,
  void
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(TAGS_REPOSITORY) private readonly tagsRepository: TagsRepository,
  ) {}

  async execute(command: DeleteTagCommand): Promise<void> {
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
    const tag = await this.tagsRepository.findById(command.tagId);
    if (!tag || tag.workspaceId !== workspace.id) {
      throw new AppException(
        'TAG_NOT_FOUND',
        'Tag not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    await this.tagsRepository.delete(command.tagId);
  }
}
