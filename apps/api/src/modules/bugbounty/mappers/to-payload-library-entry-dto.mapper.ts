import type { PayloadLibraryEntryDto } from '@pentesthub/shared';
import type { PayloadLibraryEntry } from '../../../prisma-types.js';

export function toPayloadLibraryEntryDto(
  entry: PayloadLibraryEntry,
): PayloadLibraryEntryDto {
  return {
    id: entry.id,
    workspaceId: entry.workspaceId,
    category: entry.category,
    title: entry.title,
    description: entry.description,
    example: entry.example,
    references: entry.references,
    tags: entry.tags,
    aiExplanation: entry.aiExplanation,
    createdBy: entry.createdBy,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
    isCustom: entry.workspaceId !== null,
  };
}
