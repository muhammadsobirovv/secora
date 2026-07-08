import type { ActivityDomainEvent } from '../../../common/events/activity-domain-event.interface.js';

abstract class EvidenceEvent implements ActivityDomainEvent {
  abstract readonly verb: string;
  readonly entityType = 'Evidence';

  constructor(
    public readonly workspaceId: string,
    public readonly projectId: string,
    public readonly actorUserId: string,
    public readonly evidenceId: string,
  ) {}

  get entityId(): string {
    return this.evidenceId;
  }
}

export class EvidenceCreatedEvent extends EvidenceEvent {
  readonly verb = 'evidence.uploaded';
}
export class EvidenceUpdatedEvent extends EvidenceEvent {
  readonly verb = 'evidence.updated';
}
export class EvidenceDeletedEvent extends EvidenceEvent {
  readonly verb = 'evidence.deleted';
}
