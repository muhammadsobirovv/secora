import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import type { AiConversationDto, AiProviderName } from '@pentesthub/shared';
import {
  AI_CONVERSATIONS_REPOSITORY,
  type AiConversationsRepository,
} from '../domain/repositories/ai-conversations.repository.interface.js';
import { AiContextService } from '../context/ai-context.service.js';
import { toAiConversationDto } from '../mappers/to-ai-conversation-dto.mapper.js';

export class CreateAiConversationCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly projectId: string,
    public readonly title?: string,
    public readonly provider?: AiProviderName,
    public readonly model?: string,
  ) {}
}

@CommandHandler(CreateAiConversationCommand)
export class CreateAiConversationHandler implements ICommandHandler<
  CreateAiConversationCommand,
  AiConversationDto
> {
  constructor(
    @Inject(AI_CONVERSATIONS_REPOSITORY)
    private readonly conversationsRepository: AiConversationsRepository,
    private readonly contextService: AiContextService,
  ) {}

  async execute(
    command: CreateAiConversationCommand,
  ): Promise<AiConversationDto> {
    const { workspaceId, projectId } =
      await this.contextService.resolveWorkspaceAndProject(
        command.userId,
        command.projectId,
      );

    const conversation = await this.conversationsRepository.create({
      workspaceId,
      projectId,
      userId: command.userId,
      title: command.title,
      provider: command.provider,
      model: command.model,
    });

    return toAiConversationDto({
      ...conversation,
      messageCount: 0,
      lastMessagePreview: null,
    });
  }
}
