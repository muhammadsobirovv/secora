import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
  resolvePromptTemplateForCaller,
} from '../ai-authorization.util.js';
import {
  PROMPT_TEMPLATE_REPOSITORY,
  type PromptTemplateRepository,
} from '../domain/repositories/prompt-template.repository.interface.js';

export class DeletePromptTemplateCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly templateId: string,
  ) {}
}

@CommandHandler(DeletePromptTemplateCommand)
export class DeletePromptTemplateHandler implements ICommandHandler<
  DeletePromptTemplateCommand,
  void
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROMPT_TEMPLATE_REPOSITORY)
    private readonly promptTemplatesRepository: PromptTemplateRepository,
  ) {}

  async execute(command: DeletePromptTemplateCommand): Promise<void> {
    const existing = await resolvePromptTemplateForCaller(
      this.promptTemplatesRepository,
      this.workspacesRepository,
      command.userId,
      command.templateId,
    );
    await this.promptTemplatesRepository.delete(existing.id);
  }
}
