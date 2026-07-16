import type {
  BugBountyNotification,
  BugBountyNotificationType,
} from '../../../../prisma-types.js';

export interface CreateNotificationInput {
  workspaceId: string;
  userId: string;
  type: BugBountyNotificationType;
  title: string;
  body?: string | null;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
}

/// Thrown by markRead() when the notification doesn't exist or belongs to
/// a different user — never leaked past the repository boundary as a raw
/// Prisma "record not found" error.
export class NotificationNotFoundError extends Error {
  constructor(public readonly notificationId: string) {
    super(`Notification ${notificationId} not found`);
    this.name = 'NotificationNotFoundError';
  }
}

export interface BugBountyNotificationsRepository {
  create(input: CreateNotificationInput): Promise<BugBountyNotification>;
  list(userId: string, unreadOnly?: boolean): Promise<BugBountyNotification[]>;
  /// Scoped by (id, userId) in the same UPDATE, not a separate ownership
  /// lookup — a caller can never flip another user's notification to
  /// read, even by guessing/enumerating ids (throws
  /// NotificationNotFoundError instead).
  markRead(id: string, userId: string): Promise<BugBountyNotification>;
  markAllRead(userId: string): Promise<number>;
}

export const BUGBOUNTY_NOTIFICATIONS_REPOSITORY = Symbol(
  'BUGBOUNTY_NOTIFICATIONS_REPOSITORY',
);
