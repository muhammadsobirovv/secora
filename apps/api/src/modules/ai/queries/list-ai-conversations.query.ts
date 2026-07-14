import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import type { AiConversationDto } from '@pentesthub/shared';
import {
  AI_CONVERSATIONS_REPOSITORY,
  type AiConversationsRepository,
} from '../domain/repositories/ai-conversations.repository.interface.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../ai-authorization.util.js';
import { toAiConversationDto } from '../mappers/to-ai-conversation-dto.mapper.js';
import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../common/exceptions/app.exception.js';

export class ListAiConversationsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly projectId?: string,
    public readonly search?: string,
    public readonly pinned?: boolean,
    public readonly limit?: number,
  ) {}
}

@QueryHandler(ListAiConversationsQuery)
export class ListAiConversationsHandler implements IQueryHandler<
  ListAiConversationsQuery,
  AiConversationDto[]
> {
  constructor(
    @Inject(AI_CONVERSATIONS_REPOSITORY)
    private readonly conversationsRepository: AiConversationsRepository,
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
  ) {}

  async execute(query: ListAiConversationsQuery): Promise<AiConversationDto[]> {
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

    const conversations = await this.conversationsRepository.list({
      workspaceId: workspace.id,
      projectId: query.projectId,
      userId: query.userId,
      search: query.search,
      pinned: query.pinned,
      limit: query.limit,
    });

    return conversations.map(toAiConversationDto);
  }
}
