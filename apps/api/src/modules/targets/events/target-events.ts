import type { ActivityDomainEvent } from '../../../common/events/activity-domain-event.interface.js';

abstract class TargetEvent implements ActivityDomainEvent {
  abstract readonly verb: string;
  readonly entityType = 'Target';

  constructor(
    public readonly workspaceId: string,
    public readonly projectId: string,
    public readonly actorUserId: string,
    public readonly targetId: string,
    public readonly metadata?: Record<string, unknown>,
  ) {}

  get entityId(): string {
    return this.targetId;
  }
}

export class TargetCreatedEvent extends TargetEvent {
  readonly verb = 'target.created';
}
export class TargetUpdatedEvent extends TargetEvent {
  readonly verb = 'target.updated';
}
export class TargetDeletedEvent extends TargetEvent {
  readonly verb = 'target.deleted';
}
