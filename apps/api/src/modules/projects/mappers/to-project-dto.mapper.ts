import type { ProjectDto } from '@pentesthub/shared';
import type { ProjectWithTags } from '../domain/repositories/projects.repository.interface.js';

export function toProjectDto(
  project: ProjectWithTags,
  isFavorite: boolean,
): ProjectDto {
  return {
    id: project.id,
    workspaceId: project.workspaceId,
    name: project.name,
    description: project.description,
    status: project.status,
    visibility: project.visibility,
    createdBy: project.createdBy,
    isFavorite,
    tags: project.tags.map((tag) => ({
      id: tag.id,
      workspaceId: tag.workspaceId,
      name: tag.name,
      color: tag.color,
      createdAt: tag.createdAt.toISOString(),
    })),
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}
