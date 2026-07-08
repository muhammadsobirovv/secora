import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject, HttpStatus } from '@nestjs/common';
import type { TagDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  TAGS_REPOSITORY,
  type TagsRepository,
} from '../domain/repositories/tags.repository.interface.js';

export class ListTagsQuery implements IQuery {
  constructor(public readonly userId: string) {}
}

@QueryHandler(ListTagsQuery)
export class ListTagsHandler implements IQueryHandler<ListTagsQuery, TagDto[]> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(TAGS_REPOSITORY) private readonly tagsRepository: TagsRepository,
  ) {}

  async execute(query: ListTagsQuery): Promise<TagDto[]> {
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
    const tags = await this.tagsRepository.list(workspace.id);
    return tags.map((tag) => ({
      id: tag.id,
      workspaceId: tag.workspaceId,
      name: tag.name,
      color: tag.color,
      createdAt: tag.createdAt.toISOString(),
    }));
  }
}
