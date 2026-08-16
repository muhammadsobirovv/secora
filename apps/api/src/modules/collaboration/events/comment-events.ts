import type { ActivityDomainEvent } from '../../../common/events/activity-domain-event.interface.js';

/// Module 16 — Real-time gateway (task #391) / disclosed gap fix. Prior
/// to this, `CreateCommentHandler` (comments.commands.ts) published no
/// domain event at all — comments never appeared on the Activity Timeline
/// and there was nothing for a real-time listener to subscribe to. This
/// closes that gap using the exact same `ActivityDomainEvent` pattern
/// every other module already uses (see project-events.ts), rather than
/// inventing a parallel mechanism.
///
/// Comment has no `projectId` column of its own (it's attached to an
/// entityType/entityId pair that may or may not be project-scoped) —
/// `projectId` is always `null` here, same treatment WorkspaceUpdatedEvent
/// and other workspace-level (not project-level) events already use.
export class CommentCreatedEvent implements ActivityDomainEvent {
  readonly projectId = null;
  readonly entityType = 'Comment';

  constructor(
    public readonly workspaceId: string,
    public readonly commentId: string,
    public readonly actorUserId: string,
    public readonly metadata?: Record<string, unknown>,
  ) {}

  readonly verb = 'comment.created';

  get entityId(): string {
    return this.commentId;
  }
}

/// A targeted, per-user event (as opposed to every other
/// ActivityDomainEvent, which is workspace-broadcast) — `mentionedUserId`
/// is who should actually be notified, not just "who acted." The
/// real-time gateway is the one consumer that cares about this
/// distinction (see RealtimePublishHandler); ActivityRecordingHandler
/// ignores it and just records the comment event itself.
export class MentionCreatedEvent implements ActivityDomainEvent {
  readonly projectId = null;
  readonly entityType = 'Mention';

  constructor(
    public readonly workspaceId: string,
    public readonly mentionId: string,
    public readonly actorUserId: string,
    public readonly mentionedUserId: string,
    public readonly metadata?: Record<string, unknown>,
  ) {}

  readonly verb = 'mention.created';

  get entityId(): string {
    return this.mentionId;
  }
}
