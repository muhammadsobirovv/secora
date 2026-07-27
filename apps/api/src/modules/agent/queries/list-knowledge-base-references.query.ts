import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { KnowledgeBaseReferenceEntryDto, KnowledgeBaseReferenceFramework } from '@pentesthub/shared';
import { KnowledgeBaseReferenceService } from '../knowledge-base/knowledge-base-reference.service.js';

/// Module 11 — Controllers + Swagger + module wiring + events (task #236).
/// First HTTP surface for KnowledgeBaseReferenceService (task #227), which
/// previously had zero controller/consumer outside internal agent-tool use.
export class ListKnowledgeBaseReferencesQuery implements IQuery {
  constructor(
    public readonly filter: { framework?: KnowledgeBaseReferenceFramework; limit?: number },
  ) {}
}

@QueryHandler(ListKnowledgeBaseReferencesQuery)
export class ListKnowledgeBaseReferencesHandler
  implements IQueryHandler<ListKnowledgeBaseReferencesQuery, KnowledgeBaseReferenceEntryDto[]>
{
  constructor(private readonly knowledgeBase: KnowledgeBaseReferenceService) {}

  execute(query: ListKnowledgeBaseReferencesQuery): Promise<KnowledgeBaseReferenceEntryDto[]> {
    return this.knowledgeBase.listEntries(query.filter);
  }
}
