import type {
  KnowledgeBaseChecklistItem,
  KnowledgeBaseNoteDto,
} from '@pentesthub/shared';
import type { KnowledgeBaseNote } from '../../../prisma-types.js';

function isChecklist(value: unknown): value is KnowledgeBaseChecklistItem[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item !== null &&
        typeof item === 'object' &&
        typeof (item as { text?: unknown }).text === 'string' &&
        typeof (item as { done?: unknown }).done === 'boolean',
    )
  );
}

export function toKnowledgeBaseNoteDto(
  note: KnowledgeBaseNote,
): KnowledgeBaseNoteDto {
  return {
    id: note.id,
    workspaceId: note.workspaceId,
    projectId: note.projectId,
    targetId: note.targetId,
    findingId: note.findingId,
    reportId: note.reportId,
    title: note.title,
    contentMarkdown: note.contentMarkdown,
    checklist: isChecklist(note.checklist) ? note.checklist : null,
    authorId: note.authorId,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
    // --- Module 9 additions ---
    kind: note.kind,
    tags: note.tags,
    cveId: note.cveId,
    sourceConversationId: note.sourceConversationId,
  };
}
