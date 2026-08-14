import type { ApiKeyDto } from '@pentesthub/shared';
import type { ApiKey } from '../../../prisma-types.js';

export function toApiKeyDto(apiKey: ApiKey): ApiKeyDto {
  return {
    id: apiKey.id,
    name: apiKey.name,
    workspaceId: apiKey.workspaceId,
    prefix: apiKey.prefix,
    scopes: apiKey.scopes,
    lastUsedAt: apiKey.lastUsedAt ? apiKey.lastUsedAt.toISOString() : null,
    expiresAt: apiKey.expiresAt ? apiKey.expiresAt.toISOString() : null,
    revokedAt: apiKey.revokedAt ? apiKey.revokedAt.toISOString() : null,
    createdAt: apiKey.createdAt.toISOString(),
    ipAllowlist: apiKey.ipAllowlist,
    rateLimitPerMinute: apiKey.rateLimitPerMinute,
    rotatedFromId: apiKey.rotatedFromId,
  };
}
