import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import type { AiMessageDto } from '@pentesthub/shared';
import {
  AI_CONVERSATIONS_REPOSITORY,
  type AiConversationsRepository,
} from '../domain/repositories/ai-conversations.repository.interface.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
  resolveAiConversationForCaller,
} from '../ai-authorization.util.js';
import { AiChatService } from '../chat/ai-chat.service.js';

export class ContinueAiMessageCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly conversationId: string,
    public readonly messageId: string,
  ) {}
}

@CommandHandler(ContinueAiMessageCommand)
export class ContinueAiMessageHandler implements ICommandHandler<
  ContinueAiMessageCommand,
  AiMessageDto
> {
  constructor(
    @Inject(AI_CONVERSATIONS_REPOSITORY)
    private readonly conversationsRepository: AiConversationsRepository,
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    private readonly chatService: AiChatService,
  ) {}

  async execute(command: ContinueAiMessageCommand): Promise<AiMessageDto> {
    const conversation = await resolveAiConversationForCaller(
      this.conversationsRepository,
      this.workspacesRepository,
      command.userId,
      command.conversationId,
    );
    return this.chatService.continueGeneration(
      conversation.id,
      command.messageId,
      command.userId,
    );
  }
}
