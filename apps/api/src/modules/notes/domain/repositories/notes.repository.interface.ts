import type { Note } from '../../../../prisma-types.js';

export interface CreateNoteInput {
  projectId: string;
  targetId?: string | null;
  title?: string;
  content: string;
  authorId: string;
}

export interface UpdateNoteInput {
  title?: string;
  content?: string;
  targetId?: string | null;
}

/// `targetId` is validated by the real DB foreign key (Prisma throws
/// P2003 for an unknown id), not by importing TargetsRepository — see
/// docs/adr/0002-workspace-foundation-module.md, Decision 6.
export interface NotesRepository {
  create(input: CreateNoteInput): Promise<Note>;
  findById(id: string): Promise<Note | null>;
  update(id: string, data: UpdateNoteInput): Promise<Note>;
  softDelete(id: string): Promise<Note>;
  list(projectId: string, targetId?: string): Promise<Note[]>;
}

export const NOTES_REPOSITORY = Symbol('NOTES_REPOSITORY');
