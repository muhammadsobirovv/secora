import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import type { AiConversationDetailDto } from '@pentesthub/shared';
import {
  AI_CONVERSATIONS_REPOSITORY,
  type AiConversationsRepository,
} from '../domain/repositories/ai-conversations.repository.interface.js';
import {
  AI_MESSAGES_REPOSITORY,
  type AiMessagesRepository,
} from '../domain/repositories/ai-messages.repository.interface.js';
import {
  AI_TOOL_CALL_LOGS_REPOSITORY,
  type AiToolCallLogsRepository,
} from '../domain/repositories/ai-tool-call-logs.repository.interface.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
  resolveAiConversationForCaller,
} from '../ai-authorization.util.js';
import { toAiConversationDto } from '../mappers/to-ai-conversation-dto.mapper.js';
import { toAiMessageDto } from '../mappers/to-ai-message-dto.mapper.js';

export class GetAiConversationQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly conversationId: string,
  ) {}
}

@QueryHandler(GetAiConversationQuery)
export class GetAiConversationHandler implements IQueryHandler<
  GetAiConversationQuery,
  AiConversationDetailDto
> {
  constructor(
    @Inject(AI_CONVERSATIONS_REPOSITORY)
    private readonly conversationsRepository: AiConversationsRepository,
    @Inject(AI_MESSAGES_REPOSITORY)
    private readonly messagesRepository: AiMessagesRepository,
    @Inject(AI_TOOL_CALL_LOGS_REPOSITORY)
    private readonly toolCallLogsRepository: AiToolCallLogsRepository,
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
  ) {}

  async execute(
    query: GetAiConversationQuery,
  ): Promise<AiConversationDetailDto> {
    const conversation = await resolveAiConversationForCaller(
      this.conversationsRepository,
      this.workspacesRepository,
      query.userId,
      query.conversationId,
    );

    const [messages, toolCalls] = await Promise.all([
      this.messagesRepository.listForConversation(conversation.id),
      this.toolCallLogsRepository.listForConversation(conversation.id),
    ]);
    const toolCallsByMessage = new Map<string, typeof toolCalls>();
    for (const call of toolCalls) {
      if (!call.messageId) continue;
      const existing = toolCallsByMessage.get(call.messageId) ?? [];
      existing.push(call);
      toolCallsByMessage.set(call.messageId, existing);
    }

    const conversationDto = toAiConversationDto({
      ...conversation,
      messageCount: messages.length,
      lastMessagePreview: messages.at(-1)?.content.slice(0, 160) ?? null,
    });

    return {
      ...conversationDto,
      messages: messages.map((m) =>
        toAiMessageDto(m, toolCallsByMessage.get(m.id) ?? []),
      ),
    };
  }
}
