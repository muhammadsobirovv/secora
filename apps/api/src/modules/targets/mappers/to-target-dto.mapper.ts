import type { TargetDto } from '@pentesthub/shared';
import type { TargetWithTags } from '../domain/repositories/targets.repository.interface.js';

export function toTargetDto(target: TargetWithTags): TargetDto {
  return {
    id: target.id,
    projectId: target.projectId,
    type: target.type,
    value: target.value,
    name: target.name,
    description: target.description,
    environment: target.environment,
    scopeStatus: target.scopeStatus,
    customFields:
      (target.customFields as Record<string, unknown> | null) ?? null,
    createdBy: target.createdBy,
    tags: target.tags.map((tag) => ({
      id: tag.id,
      workspaceId: tag.workspaceId,
      name: tag.name,
      color: tag.color,
      createdAt: tag.createdAt.toISOString(),
    })),
    createdAt: target.createdAt.toISOString(),
    updatedAt: target.updatedAt.toISOString(),
  };
}
