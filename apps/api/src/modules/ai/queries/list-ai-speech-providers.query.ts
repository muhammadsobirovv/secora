import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { AiSpeechProviderStatusDto } from '@pentesthub/shared';
import { AiSpeechProviderRegistryService } from '../speech/ai-speech-provider-registry.service.js';

export class ListAiSpeechProvidersQuery implements IQuery {}

@QueryHandler(ListAiSpeechProvidersQuery)
export class ListAiSpeechProvidersHandler implements IQueryHandler<
  ListAiSpeechProvidersQuery,
  AiSpeechProviderStatusDto[]
> {
  constructor(
    private readonly speechProviderRegistry: AiSpeechProviderRegistryService,
  ) {}

  execute(): Promise<AiSpeechProviderStatusDto[]> {
    return Promise.resolve(this.speechProviderRegistry.listStatuses());
  }
}
