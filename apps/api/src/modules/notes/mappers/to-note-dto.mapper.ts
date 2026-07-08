import type { NoteDto } from '@pentesthub/shared';
import type { Note } from '../../../prisma-types.js';

export function toNoteDto(note: Note): NoteDto {
  return {
    id: note.id,
    projectId: note.projectId,
    targetId: note.targetId,
    title: note.title,
    content: note.content,
    authorId: note.authorId,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}
