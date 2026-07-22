import type { TaskItemDto } from '@pentesthub/shared';
import type { TaskItem } from '../../../prisma-types.js';

export function toTaskItemDto(task: TaskItem): TaskItemDto {
  return {
    id: task.id,
    workspaceId: task.workspaceId,
    projectId: task.projectId,
    entityType: task.entityType,
    entityId: task.entityId,
    title: task.title,
    description: task.description,
    done: task.done,
    assigneeId: task.assigneeId,
    dueAt: task.dueAt ? task.dueAt.toISOString() : null,
    createdBy: task.createdBy,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}
