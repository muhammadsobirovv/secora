import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import {
  AI_MESSAGES_REPOSITORY,
  type AiMessagesRepository,
} from '../domain/repositories/ai-messages.repository.interface.js';
import {
  AI_CONVERSATIONS_REPOSITORY,
  type AiConversationsRepository,
} from '../domain/repositories/ai-conversations.repository.interface.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
  resolveAiMessageForCaller,
} from '../ai-authorization.util.js';
import { AiChatService } from '../chat/ai-chat.service.js';

export class CancelAiGenerationCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly messageId: string,
  ) {}
}

@CommandHandler(CancelAiGenerationCommand)
export class CancelAiGenerationHandler implements ICommandHandler<
  CancelAiGenerationCommand,
  { cancelled: boolean }
> {
  constructor(
    @Inject(AI_CONVERSATIONS_REPOSITORY)
    private readonly conversationsRepository: AiConversationsRepository,
    @Inject(AI_MESSAGES_REPOSITORY)
    private readonly messagesRepository: AiMessagesRepository,
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    private readonly chatService: AiChatService,
  ) {}

  async execute(
    command: CancelAiGenerationCommand,
  ): Promise<{ cancelled: boolean }> {
    const { message } = await resolveAiMessageForCaller(
      this.conversationsRepository,
      this.messagesRepository,
      this.workspacesRepository,
      command.userId,
      command.messageId,
    );
    return { cancelled: this.chatService.cancel(message.id) };
  }
}
