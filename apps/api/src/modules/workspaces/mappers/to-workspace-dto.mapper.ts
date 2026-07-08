import type { WorkspaceDto } from '@pentesthub/shared';
import type { Workspace } from '../../../prisma-types.js';

export function toWorkspaceDto(workspace: Workspace): WorkspaceDto {
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    avatarUrl: workspace.avatarUrl,
    description: workspace.description,
    createdAt: workspace.createdAt.toISOString(),
    updatedAt: workspace.updatedAt.toISOString(),
  };
}
