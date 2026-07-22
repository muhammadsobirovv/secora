import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import type { ApiKeyDto, ListApiKeysQueryDto } from '@pentesthub/shared';
import {
  API_KEYS_REPOSITORY,
  type ApiKeysRepository,
} from '../../api-keys/domain/repositories/api-keys.repository.interface.js';
import { toApiKeyDto } from '../mappers/to-api-key-dto.mapper.js';

export class ListApiKeysQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly filters: ListApiKeysQueryDto,
  ) {}
}

@QueryHandler(ListApiKeysQuery)
export class ListApiKeysHandler implements IQueryHandler<ListApiKeysQuery, ApiKeyDto[]> {
  constructor(@Inject(API_KEYS_REPOSITORY) private readonly apiKeysRepository: ApiKeysRepository) {}

  async execute(query: ListApiKeysQuery): Promise<ApiKeyDto[]> {
    const keys = query.filters.workspaceId
      ? await this.apiKeysRepository.findByWorkspace(query.filters.workspaceId)
      : await this.apiKeysRepository.findByUser(query.userId);
    return keys.map(toApiKeyDto);
  }
}
