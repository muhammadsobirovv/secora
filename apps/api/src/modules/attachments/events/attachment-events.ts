import type { ActivityDomainEvent } from '../../../common/events/activity-domain-event.interface.js';

export class AttachmentUploadedEvent implements ActivityDomainEvent {
  readonly verb = 'attachment.uploaded';
  readonly entityType = 'Attachment';

  constructor(
    public readonly workspaceId: string,
    public readonly projectId: string | null,
    public readonly actorUserId: string,
    public readonly entityId: string,
    public readonly metadata?: Record<string, unknown>,
  ) {}
}
