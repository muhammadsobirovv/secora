import type { AiMessageDto } from '@pentesthub/shared';
import type { AiMessageRecord } from '../domain/repositories/ai-messages.repository.interface.js';
import type { AiToolCallLogRecord } from '../domain/repositories/ai-tool-call-logs.repository.interface.js';

export function toAiMessageDto(
  message: AiMessageRecord,
  toolCalls: AiToolCallLogRecord[] = [],
): AiMessageDto {
  return {
    id: message.id,
    conversationId: message.conversationId,
    role: message.role,
    content: message.content,
    status: message.status,
    provider: message.provider,
    model: message.model,
    promptTokens: message.promptTokens,
    completionTokens: message.completionTokens,
    bookmarked: message.bookmarked,
    pinned: message.pinned,
    errorMessage: message.errorMessage,
    createdAt: message.createdAt.toISOString(),
    updatedAt: message.updatedAt.toISOString(),
    toolCalls: toolCalls.map((t) => ({
      id: t.id,
      conversationId: t.conversationId,
      messageId: t.messageId,
      toolName: t.toolName,
      input: t.input,
      output: t.output,
      errorMessage: t.errorMessage,
      durationMs: t.durationMs,
      createdAt: t.createdAt.toISOString(),
    })),
  };
}
