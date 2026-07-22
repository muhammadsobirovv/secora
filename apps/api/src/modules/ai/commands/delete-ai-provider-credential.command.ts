import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus, Inject } from '@nestjs/common';
import type { AiProviderName } from '@pentesthub/shared';
import { AI_PROVIDER_NAMES } from '@pentesthub/shared';
import {
  AI_PROVIDER_CREDENTIALS_REPOSITORY,
  type AiProviderCredentialsRepository,
} from '../domain/repositories/ai-provider-credentials.repository.interface.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../ai-authorization.util.js';
import { AppException } from '../../../common/exceptions/app.exception.js';

export class DeleteAiProviderCredentialCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly provider: string,
  ) {}
}

function isValidProviderName(value: string): value is AiProviderName {
  return (AI_PROVIDER_NAMES as string[]).includes(value);
}

@CommandHandler(DeleteAiProviderCredentialCommand)
export class DeleteAiProviderCredentialHandler implements ICommandHandler<
  DeleteAiProviderCredentialCommand,
  void
> {
  constructor(
    @Inject(AI_PROVIDER_CREDENTIALS_REPOSITORY)
    private readonly credentialsRepository: AiProviderCredentialsRepository,
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
  ) {}

  async execute(command: DeleteAiProviderCredentialCommand): Promise<void> {
    if (!isValidProviderName(command.provider)) {
      throw new AppException(
        'INVALID_AI_PROVIDER',
        `Unknown AI provider "${command.provider}".`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const workspace =
      await this.workspacesRepository.findPersonalWorkspaceForUser(
        command.userId,
      );
    if (!workspace) {
      throw new AppException(
        'WORKSPACE_NOT_FOUND',
        'Workspace not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    await this.credentialsRepository.delete(workspace.id, command.provider);
  }
}
