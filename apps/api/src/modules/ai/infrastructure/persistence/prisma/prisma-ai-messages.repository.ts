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

  async create(input: CreateAiMessageInput): Promise<AiMessageRecord> {
    const created = await this.txHost.tx.aiMessage.create({
      data: {
        conversationId: input.conversationId,
        role: input.role,
        content: input.content,
        status: input.status ?? 'COMPLETE',
        provider: input.provider ?? null,
        model: input.model ?? null,
      },
    });

    // Module 11 — conversation branching. `parentMessageId` isn't part of
    // the generated Prisma Client's typed AiMessage input/output yet (see
    // the raw-SQL note on PrismaAiMemoryRepository for why: the column was
    // added via a hand-applied migration, not `prisma generate`), so it's
    // set/read here as a single follow-up raw statement rather than in the
    // typed `create()` call above.
    const parentMessageId = input.parentMessageId ?? null;
    if (parentMessageId !== null) {
      await this.txHost.tx.$executeRaw`
        UPDATE "ai_messages" SET "parentMessageId" = ${parentMessageId} WHERE "id" = ${created.id}
      `;
    }

    return { ...created, parentMessageId };
  }

  async findById(id: string): Promise<AiMessageRecord | null> {
    const found = await this.txHost.tx.aiMessage.findUnique({ where: { id } });
    if (!found) return null;
    const parentMessageId = await this.getParentMessageId(id);
    return { ...found, parentMessageId };
  }

  async listForConversation(conversationId: string): Promise<AiMessageRecord[]> {
    const found = await this.txHost.tx.aiMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });
    if (found.length === 0) return [];
    const parentMessageIds = await this.getParentMessageIds(
      found.map((m) => m.id),
    );
    return found.map((m) => ({
      ...m,
      parentMessageId: parentMessageIds.get(m.id) ?? null,
    }));
  }

  /// Module 11 — all direct replies to a given message (the branch tree's
  /// children), oldest first.
  async listBranches(parentMessageId: string): Promise<AiMessageRecord[]> {
    const rows = await this.txHost.tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "ai_messages" WHERE "parentMessageId" = ${parentMessageId} ORDER BY "createdAt" ASC
    `;
    const results: AiMessageRecord[] = [];
    for (const row of rows) {
      const record = await this.findById(row.id);
      if (record) results.push(record);
    }
    return results;
  }

  async update(id: string, data: UpdateAiMessageInput): Promise<AiMessageRecord> {
    const updated = await this.txHost.tx.aiMessage.update({
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
    const parentMessageId = await this.getParentMessageId(id);
    return { ...updated, parentMessageId };
  }

  async setBookmarked(id: string, bookmarked: boolean): Promise<AiMessageRecord> {
    const updated = await this.txHost.tx.aiMessage.update({
      where: { id },
      data: { bookmarked },
    });
    const parentMessageId = await this.getParentMessageId(id);
    return { ...updated, parentMessageId };
  }

  async setPinned(id: string, pinned: boolean): Promise<AiMessageRecord> {
    const updated = await this.txHost.tx.aiMessage.update({
      where: { id },
      data: { pinned },
    });
    const parentMessageId = await this.getParentMessageId(id);
    return { ...updated, parentMessageId };
  }

  async delete(id: string): Promise<void> {
    await this.txHost.tx.aiMessage.delete({ where: { id } });
  }

  private async getParentMessageId(id: string): Promise<string | null> {
    const rows = await this.txHost.tx.$queryRaw<
      { parentMessageId: string | null }[]
    >`SELECT "parentMessageId" FROM "ai_messages" WHERE "id" = ${id}`;
    return rows[0]?.parentMessageId ?? null;
  }

  private async getParentMessageIds(
    ids: string[],
  ): Promise<Map<string, string | null>> {
    const rows = await this.txHost.tx.$queryRaw<
      { id: string; parentMessageId: string | null }[]
    >`SELECT "id", "parentMessageId" FROM "ai_messages" WHERE "id" = ANY(${ids})`;
    return new Map(rows.map((r) => [r.id, r.parentMessageId]));
  }
}
