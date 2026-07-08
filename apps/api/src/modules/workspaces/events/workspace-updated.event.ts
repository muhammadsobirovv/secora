import type { ActivityDomainEvent } from '../../../common/events/activity-domain-event.interface.js';

export class WorkspaceUpdatedEvent implements ActivityDomainEvent {
  readonly projectId = null;
  readonly verb = 'workspace.updated';
  readonly entityType = 'Workspace';

  constructor(
    public readonly workspaceId: string,
    public readonly actorUserId: string,
    public readonly entityId: string,
  ) {}
}
