import type { ActivityDomainEvent } from '../../../common/events/activity-domain-event.interface.js';

/// Module 16 — Bug Bounty Submissions + Rewards (task #385). Same shape as
/// BugBountyFindingEvent (bugbounty-finding-events.ts) — reaches webhook
/// dispatch and workflow triggers via EventBus exactly like Finding
/// lifecycle events do; see that file's doc comment for why this event
/// family is not also wired into the generic Module 2 ActivityRecordingHandler
/// (bugbounty domain events never have been — they use their own
/// notification/activity surface, e.g. BUGBOUNTY_NOTIFICATIONS_REPOSITORY).
abstract class SubmissionEvent implements ActivityDomainEvent {
  abstract readonly verb: string;
  readonly entityType = 'Submission';

  constructor(
    public readonly workspaceId: string,
    public readonly projectId: string,
    public readonly actorUserId: string | null,
    public readonly submissionId: string,
    public readonly metadata?: Record<string, unknown>,
  ) {}

  get entityId(): string {
    return this.submissionId;
  }
}

export class SubmissionCreatedEvent extends SubmissionEvent {
  readonly verb = 'bugbounty_submission.created';
}

export class SubmissionStatusChangedEvent extends SubmissionEvent {
  readonly verb = 'bugbounty_submission.status_changed';
}

/// Published in addition to SubmissionStatusChangedEvent specifically when
/// a reward is recorded (status -> BOUNTY_PAID with reward set, or an
/// explicit reward update) — lets Notifications fire a distinct "you got
/// paid" alert rather than a generic status-change one.
export class SubmissionRewardRecordedEvent extends SubmissionEvent {
  readonly verb = 'bugbounty_submission.reward_recorded';
}
