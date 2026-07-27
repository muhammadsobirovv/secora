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

/// Module 11 — AI Chat conversation branching. Mirrors SendAiMessageCommand
/// exactly, one extra field (`parentMessageId`) forwarded straight through
/// to AiChatService.branchTurn — see that method's doc comment for the
/// branching model itself.
export class BranchAiMessageCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly conversationId: string,
    public readonly parentMessageId: string,
    public readonly content: string,
  ) {}
}

@CommandHandler(BranchAiMessageCommand)
export class BranchAiMessageHandler implements ICommandHandler<
  BranchAiMessageCommand,
  StartTurnResult
> {
  constructor(
    @Inject(AI_CONVERSATIONS_REPOSITORY)
    private readonly conversationsRepository: AiConversationsRepository,
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    private readonly chatService: AiChatService,
  ) {}

  async execute(command: BranchAiMessageCommand): Promise<StartTurnResult> {
    const conversation = await resolveAiConversationForCaller(
      this.conversationsRepository,
      this.workspacesRepository,
      command.userId,
      command.conversationId,
    );
    return this.chatService.branchTurn(
      conversation.id,
      command.parentMessageId,
      command.userId,
      command.content,
    );
  }
}
