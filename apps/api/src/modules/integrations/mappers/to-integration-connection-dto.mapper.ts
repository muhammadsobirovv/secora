import type { IntegrationConnectionDto } from '@pentesthub/shared';
import type { IntegrationConnection, Prisma } from '../../../prisma-types.js';

export function toIntegrationConnectionDto(row: IntegrationConnection): IntegrationConnectionDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    provider: row.provider,
    displayName: row.displayName,
    config: (row.config as Prisma.JsonObject as Record<string, unknown> | null) ?? null,
    status: row.status,
    connectedBy: row.connectedBy,
    lastSyncedAt: row.lastSyncedAt ? row.lastSyncedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
