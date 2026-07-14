import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import {
  AI_CONVERSATIONS_REPOSITORY,
  type AiConversationsRepository,
} from '../domain/repositories/ai-conversations.repository.interface.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
  resolveAiConversationForCaller,
} from '../ai-authorization.util.js';
import {
  AiChatService,
  type StartTurnResult,
} from '../chat/ai-chat.service.js';

export class SendAiMessageCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly conversationId: string,
    public readonly content: string,
  ) {}
}

@CommandHandler(SendAiMessageCommand)
export class SendAiMessageHandler implements ICommandHandler<
  SendAiMessageCommand,
  StartTurnResult
> {
  constructor(
    @Inject(AI_CONVERSATIONS_REPOSITORY)
    private readonly conversationsRepository: AiConversationsRepository,
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    private readonly chatService: AiChatService,
  ) {}

  async execute(command: SendAiMessageCommand): Promise<StartTurnResult> {
    const conversation = await resolveAiConversationForCaller(
      this.conversationsRepository,
      this.workspacesRepository,
      command.userId,
      command.conversationId,
    );
    return this.chatService.startTurn(
      conversation.id,
      command.userId,
      command.content,
    );
  }
}
