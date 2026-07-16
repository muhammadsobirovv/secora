import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type {
  CreateKnowledgeBaseNoteInput,
  KnowledgeBaseRepository,
  ListKnowledgeBaseNotesFilter,
  UpdateKnowledgeBaseNoteInput,
} from '../../../domain/repositories/knowledge-base.repository.interface.js';
import type { KnowledgeBaseNote, Prisma } from '../../../../../prisma-types.js';

@Injectable()
export class PrismaKnowledgeBaseRepository implements KnowledgeBaseRepository {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  create(input: CreateKnowledgeBaseNoteInput): Promise<KnowledgeBaseNote> {
    return this.txHost.tx.knowledgeBaseNote.create({
      data: {
        workspaceId: input.workspaceId,
        projectId: input.projectId ?? null,
        targetId: input.targetId ?? null,
        findingId: input.findingId ?? null,
        reportId: input.reportId ?? null,
        title: input.title ?? null,
        contentMarkdown: input.contentMarkdown,
        ...(input.checklist !== undefined
          ? { checklist: input.checklist as Prisma.InputJsonValue }
          : {}),
        authorId: input.authorId,
      },
    });
  }

  findById(id: string): Promise<KnowledgeBaseNote | null> {
    return this.txHost.tx.knowledgeBaseNote.findFirst({
      where: { id, deletedAt: null },
    });
  }

  findByIdForWorkspace(
    id: string,
    workspaceId: string,
  ): Promise<KnowledgeBaseNote | null> {
    return this.txHost.tx.knowledgeBaseNote.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
  }

  list(filter: ListKnowledgeBaseNotesFilter): Promise<KnowledgeBaseNote[]> {
    return this.txHost.tx.knowledgeBaseNote.findMany({
      where: {
        workspaceId: filter.workspaceId,
        deletedAt: null,
        ...(filter.projectId ? { projectId: filter.projectId } : {}),
        ...(filter.targetId ? { targetId: filter.targetId } : {}),
        ...(filter.findingId ? { findingId: filter.findingId } : {}),
        ...(filter.reportId ? { reportId: filter.reportId } : {}),
        ...(filter.search
          ? {
              OR: [
                { title: { contains: filter.search, mode: 'insensitive' } },
                {
                  contentMarkdown: {
                    contains: filter.search,
                    mode: 'insensitive',
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  update(
    id: string,
    input: UpdateKnowledgeBaseNoteInput,
  ): Promise<KnowledgeBaseNote> {
    return this.txHost.tx.knowledgeBaseNote.update({
      where: { id },
      data: {
        ...(input.targetId !== undefined ? { targetId: input.targetId } : {}),
        ...(input.findingId !== undefined
          ? { findingId: input.findingId }
          : {}),
        ...(input.reportId !== undefined ? { reportId: input.reportId } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.contentMarkdown !== undefined
          ? { contentMarkdown: input.contentMarkdown }
          : {}),
        ...(input.checklist !== undefined
          ? { checklist: input.checklist as Prisma.InputJsonValue }
          : {}),
      },
    });
  }

  async softDelete(id: string): Promise<void> {
    await this.txHost.tx.knowledgeBaseNote.update({
      where: { id },
      data: { deletedAt: new Date