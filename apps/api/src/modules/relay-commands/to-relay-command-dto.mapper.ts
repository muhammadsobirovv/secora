import type { RelayCommandDto } from '@pentesthub/shared';
import type { RelayCommandRow } from './relay-commands.repository.js';

export function toRelayCommandDto(row: RelayCommandRow): RelayCommandDto {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    target: row.target,
    commandType: row.commandType,
    payload: row.payloadJson,
    status: row.status,
    result: row.resultJson,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    deliveredAt: row.deliveredAt ? row.deliveredAt.toISOString() : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}
