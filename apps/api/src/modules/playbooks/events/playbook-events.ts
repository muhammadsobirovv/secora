import type { ActivityDomainEvent } from '../../../common/events/activity-domain-event.interface.js';

/// Module 16 — Playbooks + Playbook Builder (task #389). Same event-family
/// shape as SubmissionEvent/BugBountyFindingEvent — reaches webhook
/// dispatch and workflow triggers via EventBus.
abstract class PlaybookEvent implements ActivityDomainEvent {
  abstract readonly verb: string;
  readonly entityType = 'Playbook';

  constructor(
    public readonly workspaceId: string,
    public readonly actorUserId: string | null,
    public readonly playbookId: string,
    public readonly metadata?: Record<string, unknown>,
  ) {}

  get entityId(): string {
    return this.playbookId;
  }

  get projectId(): string | null {
    return null;
  }
}

export class PlaybookCreatedEvent extends PlaybookEvent {
  readonly verb = 'playbook.created';
}

export class PlaybookPublishedEvent extends PlaybookEvent {
  readonly verb = 'playbook.published';
}

export class PlaybookClonedEvent extends PlaybookEvent {
  readonly verb = 'playbook.cloned';
}

export class PlaybookArchivedEvent extends PlaybookEvent {
  readonly verb = 'playbook.archived';
}
