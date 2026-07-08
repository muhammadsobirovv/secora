import type { ActivityDomainEvent } from '../../../common/events/activity-domain-event.interface.js';

/// One file for all Project lifecycle events — they share the exact same
/// shape (workspaceId/projectId/actor/entity), only `verb` differs, so
/// six near-identical files would be pure ceremony.
abstract class ProjectEvent implements ActivityDomainEvent {
  abstract readonly verb: string;
  readonly entityType = 'Project';

  constructor(
    public readonly workspaceId: string,
    public readonly projectId: string,
    public readonly actorUserId: string,
    public readonly metadata?: Record<string, unknown>,
  ) {}

  get entityId(): string {
    return this.projectId;
  }
}

export class ProjectCreatedEvent extends ProjectEvent {
  readonly verb = 'project.created';
}
export class ProjectUpdatedEvent extends ProjectEvent {
  readonly verb = 'project.updated';
}
export class ProjectArchivedEvent extends ProjectEvent {
  readonly verb = 'project.archived';
}
export class ProjectRestoredEvent extends ProjectEvent {
  readonly verb = 'project.restored';
}
export class ProjectDeletedEvent extends ProjectEvent {
  readonly verb = 'project.deleted';
}
export class ProjectFavoritedEvent extends ProjectEvent {
  readonly verb = 'project.favorited';
}
export class ProjectMemberAddedEvent extends ProjectEvent {
  readonly verb = 'project.member_added';
}
