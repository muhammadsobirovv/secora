import type { KnowledgeBaseReferenceEntryDto } from '@pentesthub/shared';
import type { KnowledgeBaseReferenceEntryRecord } from '../domain/repositories/knowledge-base-reference.repository.interface.js';

export function toKnowledgeBaseReferenceEntryDto(
  record: KnowledgeBaseReferenceEntryRecord,
): KnowledgeBaseReferenceEntryDto {
  return {
    id: record.id,
    framework: record.framework,
    code: record.code,
    title: record.title,
    summary: record.summary,
    url: record.url,
    metadata: record.metadata,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
