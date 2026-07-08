import type { ActivityDomainEvent } from '../../../common/events/activity-domain-event.interface.js';

abstract class NoteEvent implements ActivityDomainEvent {
  abstract readonly verb: string;
  readonly entityType = 'Note';

  constructor(
    public readonly workspaceId: string,
    public readonly projectId: string,
    public readonly actorUserId: string,
    public readonly noteId: string,
  ) {}

  get entityId(): string {
    return this.noteId;
  }
}

export class NoteCreatedEvent extends NoteEvent {
  readonly verb = 'note.created';
}
export class NoteUpdatedEvent extends NoteEvent {
  readonly verb = 'note.updated';
}
export class NoteDeletedEvent extends NoteEvent {
  readonly verb = 'note.deleted';
}
