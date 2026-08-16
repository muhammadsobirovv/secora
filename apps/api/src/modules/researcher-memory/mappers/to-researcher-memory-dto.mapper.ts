import type { ResearcherMemoryEntryDto } from '@pentesthub/shared';
import type { ResearcherMemoryEntry } from '../../../prisma-types.js';

export function toResearcherMemoryEntryDto(entry: ResearcherMemoryEntry): ResearcherMemoryEntryDto {
  return {
    id: entry.id,
    kind: entry.kind,
    title: entry.title,
    content: entry.content,
    tags: entry.tags,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}
