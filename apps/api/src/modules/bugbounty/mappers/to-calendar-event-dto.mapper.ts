import type { BugBountyCalendarEventDto } from '@pentesthub/shared';
import type { BugBountyCalendarEvent } from '../../../prisma-types.js';

export function toCalendarEventDto(
  event: BugBountyCalendarEvent,
): BugBountyCalendarEventDto {
  return {
    id: event.id,
    workspaceId: event.workspaceId,
    programId: event.programId,
    reportId: event.reportId,
    type: event.type,
    title: event.title,
    dueAt: event.dueAt.toISOString(),
    completedAt: event.completedAt?.toISOString() ?? null,
    notes: event.notes,
    createdBy: event.createdBy,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  };
}
