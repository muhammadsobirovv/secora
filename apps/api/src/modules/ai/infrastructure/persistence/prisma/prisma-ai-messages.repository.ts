import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type {
  AiMessageRecord,
  AiMessagesRepository,
  CreateAiMessageInput,
  UpdateAiMessageInput,
} from '../../../domain/repositories/ai-messages.repository.interface.js';

@Injectable()
export class PrismaAiMessagesRepository implements AiMessagesRepository {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  create(input: CreateAiMessageInput): Promise<AiMessageRecord> {
    return this.txHost.tx.aiMessage.create({
      data: {
        conversationId: input.conversationId,
        role: input.role,
        content: input.content,
        status: input.status ?? 'COMPLETE',
        provider: input.provider ?? null,
        model: input.model ?? null,
      },
    });
  }

  findById(id: string): Promise<AiMessageRecord | null> {
    return this.txHost.tx.aiMessage.findUnique({ where: { id } });
  }

  listForConversation(conversationId: string): Promise<AiMessageRecord[]> {
    return this.txHost.tx.aiMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });
  }

  update(id: string, data: UpdateAiMessageInput): Promise<AiMessageRecord> {
    return this.txHost.tx.aiMessage.update({
      where: { id },
      data: {
        ...(data.content !== undefined ? { content: data.content } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.promptTokens !== undefined
          ? { promptTokens: data.promptTokens }
          : {}),
        ...(data.completionTokens !== undefined
          ? { completionTokens: data.completionTokens }
          : {}),
        ...(data.errorMessage !== undefined
          ? { errorMessage: data.errorMessage }
          : {}),
      },
    });
  }

  setBookmarked(id: string, bookmarked: boolean): Promise<AiMessageRecord> {
    return this.txHost.tx.aiMessage.update({
      where: { id },
      data: { bookmarked },
    });
  }

  setPinned(id: string, pinned: boolean): Promise<AiMessageRecord> {
    return this.txHost.tx.aiMessage.update({ where: { id }, data: { pinned } });
  }

  async delete(id: string): Promise<void> {
    await this.txHost.tx.aiMessage.delete({ where: { id } });
  }
}
