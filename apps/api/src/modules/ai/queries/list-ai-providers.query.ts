import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { AiProviderStatusDto } from '@pentesthub/shared';
import { AiProviderRegistryService } from '../providers/ai-provider-registry.service.js';

export class ListAiProvidersQuery implements IQuery {}

@QueryHandler(ListAiProvidersQuery)
export class ListAiProvidersHandler implements IQueryHandler<
  ListAiProvidersQuery,
  AiProviderStatusDto[]
> {
  constructor(private readonly providerRegistry: AiProviderRegistryService) {}

  execute(): Promise<AiProviderStatusDto[]> {
    return Promise.resolve(this.providerRegistry.listStatuses());
  }
}
