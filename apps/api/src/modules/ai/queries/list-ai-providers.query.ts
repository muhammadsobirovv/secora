import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { HttpStatus, Inject } from '@nestjs/common';
import type { AiProviderStatusDto } from '@pentesthub/shared';
import { AiProviderRegistryService } from '../providers/ai-provider-registry.service.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../ai-authorization.util.js';
import { AppException } from '../../../common/exceptions/app.exception.js';

export class ListAiProvidersQuery implements IQuery {
  constructor(public readonly userId: string) {}
}

@QueryHandler(ListAiProvidersQuery)
export class ListAiProvidersHandler implements IQueryHandler<
  ListAiProvidersQuery,
  AiProviderStatusDto[]
> {
  constructor(
    private readonly providerRegistry: AiProviderRegistryService,
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
  ) {}

  async execute(query: ListAiProvidersQuery): Promise<AiProviderStatusDto[]> {
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

    return this.providerRegistry.listStatuses(workspace.id);
  }
}
