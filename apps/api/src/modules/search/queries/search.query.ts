import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject, HttpStatus } from '@nestjs/common';
import type { SearchResultDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  SEARCH_SERVICE,
  type SearchService,
} from '../domain/search-service.interface.js';

export class SearchQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly q: string,
  ) {}
}

@QueryHandler(SearchQuery)
export class SearchHandler implements IQueryHandler<
  SearchQuery,
  SearchResultDto[]
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(SEARCH_SERVICE) private readonly searchService: SearchService,
  ) {}

  async execute(query: SearchQuery): Promise<SearchResultDto[]> {
    if (query.q.trim().length === 0) return [];
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
    return this.searchService.search(workspace.id, query.q.trim());
  }
}
