import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { HttpStatus, Inject } from '@nestjs/common';
import type { AiMemorySourceType } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../ai-authorization.util.js';
import { AiMemoryService } from '../memory/ai-memory.service.js';
import type { AiMemorySearchResult } from '../domain/repositories/ai-memory.repository.interface.js';

export class SearchAiMemoryQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly query: string,
    public readonly projectId?: string,
    public readonly sourceType?: AiMemorySourceType,
  ) {}
}

@QueryHandler(SearchAiMemoryQuery)
export class SearchAiMemoryHandler implements IQueryHandler<
  SearchAiMemoryQuery,
  AiMemorySearchResult[]
> {
  constructor(
    private readonly memoryService: AiMemoryService,
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
  ) {}

  async execute(query: SearchAiMemoryQuery): Promise<AiMemorySearchResult[]> {
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
    return this.memoryService.search(workspace.id, query.query, {
      projectId: query.projectId,
      sourceType: query.sourceType,
    });
  }
}
