import type { AssignmentDto } from '@pentesthub/shared';
import type { Assignment } from '../../../prisma-types.js';

export function toAssignmentDto(assignment: Assignment): AssignmentDto {
  return {
    id: assignment.id,
    workspaceId: assignment.workspaceId,
    entityType: assignment.entityType,
    entityId: assignment.entityId,
    assigneeId: assignment.assigneeId,
    assignedBy: assignment.assignedBy,
    status: assignment.status,
    dueAt: assignment.dueAt ? assignment.dueAt.toISOString() : null,
    createdAt: assignment.createdAt.toISOString(),
    updatedAt: assignment.updatedAt.toISOString(),
  };
}
