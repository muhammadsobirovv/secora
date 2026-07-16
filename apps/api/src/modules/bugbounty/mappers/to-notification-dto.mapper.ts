import type { BugBountyNotificationDto } from '@pentesthub/shared';
import type { BugBountyNotification } from '../../../prisma-types.js';

export function toNotificationDto(
  notification: BugBountyNotification,
): BugBountyNotificationDto {
  return {
    id: notification.id,
    workspaceId: notification.workspaceId,
    userId: notification.userId,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    relatedEntityType: notification.relatedEntityType,
    relatedEntityId: notification.relatedEntityId,
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
  };
}
