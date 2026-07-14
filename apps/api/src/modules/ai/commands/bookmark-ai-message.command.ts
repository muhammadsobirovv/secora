import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import type { AiMessageDto } from '@pentesthub/shared';
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
import { toAiMessageDto } from '../mappers/to-ai-message-dto.mapper.js';

export class BookmarkAiMessageCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly messageId: string,
    public readonly bookmarked: boolean,
  ) {}
}

@CommandHandler(BookmarkAiMessageCommand)
export class BookmarkAiMessageHandler implements ICommandHandler<
  BookmarkAiMessageCommand,
  AiMessageDto
> {
  constructor(
    @Inject(AI_CONVERSATIONS_REPOSITORY)
    private readonly conversationsRepository: AiConversationsRepository,
    @Inject(AI_MESSAGES_REPOSITORY)
    private readonly messagesRepository: AiMessagesRepository,
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
  ) {}

  async execute(command: BookmarkAiMessageCommand): Promise<AiMessageDto> {
    const { message } = await resolveAiMessageForCaller(
      this.conversationsRepository,
      this.messagesRepository,
      this.workspacesRepository,
      command.userId,
      command.messageId,
    );
    const updated = await this.messagesRepository.setBookmarked(
      message.id,
      command.bookmarked,
    );
    return toAiMessageDto(updated);
  }
}
