import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { HttpStatus, Inject } from '@nestjs/common';
import type { AiProviderMarketplaceEntryDto } from '@pentesthub/shared';
import { AiProviderRegistryService } from '../providers/ai-provider-registry.service.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../ai-authorization.util.js';
import { AppException } from '../../../common/exceptions/app.exception.js';

/// Module 15 — AI provider marketplace (BYOK expansion, task #341). Mirrors
/// ListAiProvidersQuery/ListAiProvidersHandler exactly, just against
/// AiProviderRegistryService.listMarketplace instead of listStatuses.
export class ListAiProviderMarketplaceQuery implements IQuery {
  constructor(public readonly userId: string) {}
}

@QueryHandler(ListAiProviderMarketplaceQuery)
export class ListAiProviderMarketplaceHandler implements IQueryHandler<
  ListAiProviderMarketplaceQuery,
  AiProviderMarketplaceEntryDto[]
> {
  constructor(
    private readonly providerRegistry: AiProviderRegistryService,
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
  ) {}

  async execute(query: ListAiProviderMarketplaceQuery): Promise<AiProviderMarketplaceEntryDto[]> {
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

    return this.providerRegistry.listMarketplace(workspace.id);
  }
}
