import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import type { AiConversationDto } from '@pentesthub/shared';
import {
  AI_CONVERSATIONS_REPOSITORY,
  type AiConversationsRepository,
} from '../domain/repositories/ai-conversations.repository.interface.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
  resolveAiConversationForCaller,
} from '../ai-authorization.util.js';
import { toAiConversationDto } from '../mappers/to-ai-conversation-dto.mapper.js';

export class PinAiConversationCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly conversationId: string,
    public readonly pinned: boolean,
  ) {}
}

@CommandHandler(PinAiConversationCommand)
export class PinAiConversationHandler implements ICommandHandler<
  PinAiConversationCommand,
  AiConversationDto
> {
  constructor(
    @Inject(AI_CONVERSATIONS_REPOSITORY)
    private readonly conversationsRepository: AiConversationsRepository,
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
  ) {}

  async execute(command: PinAiConversationCommand): Promise<AiConversationDto> {
    const conversation = await resolveAiConversationForCaller(
      this.conversationsRepository,
      this.workspacesRepository,
      command.userId,
      command.conversationId,
    );
    const updated = await this.conversationsRepository.setPinned(
      conversation.id,
      command.pinned,
    );
    return toAiConversationDto({
      ...updated,
      messageCount: 0,
      lastMessagePreview: null,
    });
  }
}
