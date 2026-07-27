import { HttpStatus } from '@nestjs/common';
import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { KnowledgeBaseReferenceEntryDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { KnowledgeBaseReferenceService } from '../knowledge-base/knowledge-base-reference.service.js';

/// Module 11 — Controllers + Swagger + module wiring + events (task #236).
export class GetKnowledgeBaseReferenceQuery implements IQuery {
  constructor(public readonly id: string) {}
}

@QueryHandler(GetKnowledgeBaseReferenceQuery)
export class GetKnowledgeBaseReferenceHandler
  implements IQueryHandler<GetKnowledgeBaseReferenceQuery, KnowledgeBaseReferenceEntryDto>
{
  constructor(private readonly knowledgeBase: KnowledgeBaseReferenceService) {}

  async execute(query: GetKnowledgeBaseReferenceQuery): Promise<KnowledgeBaseReferenceEntryDto> {
    const entry = await this.knowledgeBase.getEntry(query.id);
    if (!entry) {
      throw new AppException(
        'KNOWLEDGE_BASE_REFERENCE_NOT_FOUND',
        'Knowledge base reference entry not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    return entry;
  }
}
