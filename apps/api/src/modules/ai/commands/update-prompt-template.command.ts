import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import type { PromptTemplateDto, UpdatePromptTemplateRequestDto } from '@pentesthub/shared';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
  resolvePromptTemplateForCaller,
} from '../ai-authorization.util.js';
import {
  PROMPT_TEMPLATE_REPOSITORY,
  type PromptTemplateRepository,
} from '../domain/repositories/prompt-template.repository.interface.js';
import { toPromptTemplateDto } from '../mappers/to-prompt-template-dto.mapper.js';

export class UpdatePromptTemplateCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly templateId: string,
    public readonly data: UpdatePromptTemplateRequestDto,
  ) {}
}

@CommandHandler(UpdatePromptTemplateCommand)
export class UpdatePromptTemplateHandler implements ICommandHandler<
  UpdatePromptTemplateCommand,
  PromptTemplateDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROMPT_TEMPLATE_REPOSITORY)
    private readonly promptTemplatesRepository: PromptTemplateRepository,
  ) {}

  async execute(command: UpdatePromptTemplateCommand): Promise<PromptTemplateDto> {
    const existing = await resolvePromptTemplateForCaller(
      this.promptTemplatesRepository,
      this.workspacesRepository,
      command.userId,
      command.templateId,
    );

    const updated = await this.promptTemplatesRepository.update(existing.id, {
      name: command.data.name,
      description: command.data.description,
      promptText: command.data.promptText,
      category: command.data.category,
    });
    return toPromptTemplateDto(updated);
  }
}
