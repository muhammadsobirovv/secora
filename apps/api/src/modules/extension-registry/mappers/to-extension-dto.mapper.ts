import type { ExtensionDto, ExtensionPermission, ExtensionType } from '@pentesthub/shared';
import type { ExtensionRegistration } from '../../../prisma-types.js';

/// Module 16 — Extension API registry (task #401). `permissions`/
/// `capabilities` are stored as plain `String[]` columns (see
/// schema.prisma's doc comment on `ExtensionRegistration`) — cast back to
/// the closed-world union types here, at the read boundary, rather than
/// at the DB layer.
export function toExtensionDto(row: ExtensionRegistration): ExtensionDto {
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    type: row.type as ExtensionType,
    permissions: row.permissions as ExtensionPermission[],
    capabilities: row.capabilities,
    entrypoint: row.entrypoint,
    metadata: (row.metadata as Record<string, unknown> | null) ?? undefined,
    enabled: row.enabled,
    registeredBy: row.registeredBy,
    registeredAt: row.registeredAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
