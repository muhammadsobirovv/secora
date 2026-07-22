import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { HttpStatus, Inject } from '@nestjs/common';
import type { AiProviderCredentialDto } from '@pentesthub/shared';
import {
  AI_PROVIDER_CREDENTIALS_REPOSITORY,
  type AiProviderCredentialsRepository,
} from '../domain/repositories/ai-provider-credentials.repository.interface.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../ai-authorization.util.js';
import { toAiProviderCredentialDto } from '../mappers/to-ai-provider-credential-dto.mapper.js';
import { AppException } from '../../../common/exceptions/app.exception.js';

export class ListAiProviderCredentialsQuery implements IQuery {
  constructor(public readonly userId: string) {}
}

@QueryHandler(ListAiProviderCredentialsQuery)
export class ListAiProviderCredentialsHandler implements IQueryHandler<
  ListAiProviderCredentialsQuery,
  AiProviderCredentialDto[]
> {
  constructor(
    @Inject(AI_PROVIDER_CREDENTIALS_REPOSITORY)
    private readonly credentialsRepository: AiProviderCredentialsRepository,
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
  ) {}

  async execute(
    query: ListAiProviderCredentialsQuery,
  ): Promise<AiProviderCredentialDto[]> {
    const workspace =
      await this.workspacesRepository.findPersonalWorkspaceForUser(
        query.userId,
      );
    if (!workspace) {
      throw new AppException(
        'WORKSPACE_NOT_FOUND',
        'Workspace not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    const records = await this.credentialsRepository.listByWorkspace(
      workspace.id,
    );
    return records.map(toAiProviderCredentialDto);
  }
}
