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

export class DeleteAiConversationCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly conversationId: string,
  ) {}
}

@CommandHandler(DeleteAiConversationCommand)
export class DeleteAiConversationHandler implements ICommandHandler<
  DeleteAiConversationCommand,
  void
> {
  constructor(
    @Inject(AI_CONVERSATIONS_REPOSITORY)
    private readonly conversationsRepository: AiConversationsRepository,
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
  ) {}

  async execute(command: DeleteAiConversationCommand): Promise<void> {
    const conversation = await resolveAiConversationForCaller(
      this.conversationsRepository,
      this.workspacesRepository,
      command.userId,
      command.conversationId,
    );
    await this.conversationsRepository.delete(conversation.id);
  }
}
