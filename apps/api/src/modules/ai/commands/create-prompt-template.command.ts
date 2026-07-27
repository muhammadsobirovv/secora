import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus, Inject } from '@nestjs/common';
import type { CreatePromptTemplateRequestDto, PromptTemplateDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  PROMPT_TEMPLATE_REPOSITORY,
  type PromptTemplateRepository,
} from '../domain/repositories/prompt-template.repository.interface.js';
import { toPromptTemplateDto } from '../mappers/to-prompt-template-dto.mapper.js';

export class CreatePromptTemplateCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly data: CreatePromptTemplateRequestDto,
  ) {}
}

@CommandHandler(CreatePromptTemplateCommand)
export class CreatePromptTemplateHandler implements ICommandHandler<
  CreatePromptTemplateCommand,
  PromptTemplateDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROMPT_TEMPLATE_REPOSITORY)
    private readonly promptTemplatesRepository: PromptTemplateRepository,
  ) {}

  async execute(command: CreatePromptTemplateCommand): Promise<PromptTemplateDto> {
    const workspace = await this.workspacesRepository.findPersonalWorkspaceForUser(
      command.userId,
    );
    if (!workspace) {
      throw new AppException(
        'WORKSPACE_NOT_FOUND',
        'Workspace not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    const record = await this.promptTemplatesRepository.create({
      workspaceId: workspace.id,
      name: command.data.name,
      description: command.data.description ?? null,
      promptText: command.data.promptText,
      category: command.data.category ?? null,
      createdBy: command.userId,
    });
    return toPromptTemplateDto(record);
  }
}
