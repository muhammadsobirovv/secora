import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type {
  AiConversationListItem,
  AiConversationRecord,
  AiConversationsRepository,
  CreateAiConversationInput,
  ListAiConversationsFilter,
} from '../../../domain/repositories/ai-conversations.repository.interface.js';

@Injectable()
export class PrismaAiConversationsRepository implements AiConversationsRepository {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  create(input: CreateAiConversationInput): Promise<AiConversationRecord> {
    return this.txHost.tx.aiConversation.create({
      data: {
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        userId: input.userId,
        title: input.title ?? null,
        provider: input.provider ?? null,
        model: input.model ?? null,
      },
    });
  }

  findById(id: string): Promise<AiConversationRecord | null> {
    return this.txHost.tx.aiConversation.findUnique({ where: { id } });
  }

  async list(
    filter: ListAiConversationsFilter,
  ): Promise<AiConversationListItem[]> {
    const conversations = await this.txHost.tx.aiConversation.findMany({
      where: {
        workspaceId: filter.workspaceId,
        ...(filter.projectId ? { projectId: filter.projectId } : {}),
        ...(filter.userId ? { userId: filter.userId } : {}),
        ...(filter.pinned !== undefined ? { pinned: filter.pinned } : {}),
        ...(filter.includeArchived ? {} : { archivedAt: null }),
        ...(filter.search
          ? { title: { contains: filter.search, mode: 'insensitive' } }
          : {}),
      },
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
      take: filter.limit ?? 50,
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { content: true },
        },
        _count: { select: { messages: true } },
      },
    });

    return conversations.map((c) => ({
      id: c.id,
      workspaceId: c.workspaceId,
      projectId: c.projectId,
      userId: c.userId,
      title: c.title,
      provider: c.provider,
      model: c.model,
      pinned: c.pinned,
      archivedAt: c.archivedAt,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      messageCount: c._count.messages,
      lastMessagePreview: c.messages[0]?.content.slice(0, 160) ?? null,
    }));
  }

  async setTitle(id: string, title: string): Promise<void> {
    await this.txHost.tx.aiConversation.update({ where: { id }, data: { title } });
  }

  setPinned(id: string, pinned: boolean): Promise<AiConversationRecord> {
    return this.txHost.tx.aiConversation.update({
      where: { id },
      data: { pinned },
    });
  }

  setArchived(id: string, archived: boolean): Promise<AiConversationRecord> {
    return this.txHost.tx.aiConversation.update({
      where: { id },
      data: { archivedAt: archived ? new Date() : null },
    });
  }

  async touch(id: string): Promise<void> {
    await this.txHost.tx.aiConversation.update({
      where: { id },
      data: { updatedAt: new Date() },
    });
  }

  async delete(id: string): Promise<void> {
    await this.txHost.tx.aiConversation.delete({ where: { id } });
  }
}
