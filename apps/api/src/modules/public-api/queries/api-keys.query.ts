import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import type { ApiKeyDto, ListApiKeysQueryDto } from '@pentesthub/shared';
import {
  API_KEYS_REPOSITORY,
  type ApiKeysRepository,
} from '../../api-keys/domain/repositories/api-keys.repository.interface.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveWorkspaceMembership } from '../../collaboration/workspace-membership.util.js';
import { toApiKeyDto } from '../mappers/to-api-key-dto.mapper.js';

export class ListApiKeysQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly filters: ListApiKeysQueryDto,
  ) {}
}

@QueryHandler(ListApiKeysQuery)
export class ListApiKeysHandler implements IQueryHandler<ListApiKeysQuery, ApiKeyDto[]> {
  constructor(
    @Inject(API_KEYS_REPOSITORY) private readonly apiKeysRepository: ApiKeysRepository,
    private readonly prisma: PrismaService,
  ) {}

  async execute(query: ListApiKeysQuery): Promise<ApiKeyDto[]> {
    if (query.filters.workspaceId) {
      // IDOR fix (Module 20 security audit): a caller must be a member of
      // the workspace whose keys they're asking for. Without this check
      // any authenticated user could pass an arbitrary workspaceId and
      // enumerate another workspace's API key metadata (name, prefix,
      // scopes, IP allowlist, rate limit) — never the raw key itself, but
      // still real reconnaissance value and a workspace-isolation
      // violation on its own. Matches the membership check every other
      // workspace-scoped handler in this file's sibling
      // (api-keys.commands.ts) already performs.
      await resolveWorkspaceMembership(this.prisma, query.userId, query.filters.workspaceId);
      const keys = await this.apiKeysRepository.findByWorkspace(query.filters.workspaceId);
      return keys.map(toApiKeyDto);
    }
    const keys = await this.apiKeysRepository.findByUser(query.userId);
    return keys.map(toApiKeyDto);
  }
}
