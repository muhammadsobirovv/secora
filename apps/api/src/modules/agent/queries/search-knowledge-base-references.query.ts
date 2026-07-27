import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type {
  KnowledgeBaseReferenceFramework,
  KnowledgeBaseReferenceSearchResultDto,
} from '@pentesthub/shared';
import { KnowledgeBaseReferenceService } from '../knowledge-base/knowledge-base-reference.service.js';

/// Module 11 — Controllers + Swagger + module wiring + events (task #236).
export class SearchKnowledgeBaseReferencesQuery implements IQuery {
  constructor(
    public readonly input: {
      query: string;
      framework?: KnowledgeBaseReferenceFramework;
      limit?: number;
    },
  ) {}
}

@QueryHandler(SearchKnowledgeBaseReferencesQuery)
export class SearchKnowledgeBaseReferencesHandler
  implements
    IQueryHandler<SearchKnowledgeBaseReferencesQuery, KnowledgeBaseReferenceSearchResultDto[]>
{
  constructor(private readonly knowledgeBase: KnowledgeBaseReferenceService) {}

  execute(
    query: SearchKnowledgeBaseReferencesQuery,
  ): Promise<KnowledgeBaseReferenceSearchResultDto[]> {
    return this.knowledgeBase.search(query.input);
  }
}
