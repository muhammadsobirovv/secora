import type { KnowledgeBaseNote, Prisma } from '../../../../prisma-types.js';

export interface ListKnowledgeBaseNotesFilter {
  workspaceId: string;
  projectId?: string;
  targetId?: string;
  findingId?: string;
  reportId?: string;
  search?: string;
}

export interface CreateKnowledgeBaseNoteInput {
  workspaceId: string;
  projectId?: string | null;
  targetId?: string | null;
  findingId?: string | null;
  reportId?: string | null;
  title?: string | null;
  contentMarkdown: string;
  checklist?: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  authorId: string;
}

export type UpdateKnowledgeBaseNoteInput = Partial<
  Omit<CreateKnowledgeBaseNoteInput, 'workspaceId' | 'authorId'>
>;

export interface KnowledgeBaseRepository {
  create(input: CreateKnowledgeBaseNoteInput): Promise<KnowledgeBaseNote>;
  findById(id: string): Promise<KnowledgeBaseNote | null>;
  findByIdForWorkspace(
    id: string,
    workspaceId: string,
  ): Promise<KnowledgeBaseNote | null>;
  list(filter: ListKnowledgeBaseNotesFilter): Promise<KnowledgeBaseNote[]>;
  update(
    id: string,
    input: UpdateKnowledgeBaseNoteInput,
  ): Promise<KnowledgeBaseNote>;
  softDelete(id: string): Promise<void>;
}

export const KNOWLEDGE_BASE_REPOSITORY = Symbol('KNO