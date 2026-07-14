import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type { Prisma } from '../../../../../prisma-types.js';
import type {
  AiToolCallLogRecord,
  AiToolCallLogsRepository,
  CreateAiToolCallLogInput,
} from '../../../domain/repositories/ai-tool-call-logs.repository.interface.js';

@Injectable()
export class PrismaAiToolCallLogsRepository implements AiToolCallLogsRepository {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  create(input: CreateAiToolCallLogInput): Promise<AiToolCallLogRecord> {
    return this.txHost.tx.aiToolCallLog.create({
      data: {
        conversationId: input.conversationId,
        messageId: input.messageId ?? null,
        toolName: input.toolName,
        input: input.input as Prisma.InputJsonValue,
        output: (input.output ?? undefined) as
          Prisma.InputJsonValue | undefined,
        errorMessage: input.errorMessage ?? null,
        durationMs: input.durationMs ?? null,
      },
    }) as unknown as Promise<AiToolCallLogRecord>;
  }

  listForConversation(conversationId: string): Promise<AiToolCallLogRecord[]> {
    return this.txHost.tx.aiToolCallLog.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    }) as unknown as Promise<AiToolCallLogRecord[]>;
  }

  listForMessage(messageId: string): Promise<AiToolCallLogRecord[]> {
    return this.txHost.tx.aiToolCallLog.findMany({
      where: { messageId },
      orderBy: { createdAt: 'asc' },
    }) as unknown as Promise<AiToolCallLogRecord[]>;
  }
}
