import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import {
  ACTIVITY_REPOSITORY,
  type ActivityRepository,
} from '../domain/repositories/activity.repository.interface.js';
import type { ActivityDomainEvent } from '../../../common/events/activity-domain-event.interface.js';
import {
  ProjectArchivedEvent,
  ProjectCreatedEvent,
  ProjectDeletedEvent,
  ProjectFavoritedEvent,
  ProjectMemberAddedEvent,
  ProjectRestoredEvent,
  ProjectUpdatedEvent,
} from '../../projects/events/project-events.js';
import {
  TargetCreatedEvent,
  TargetDeletedEvent,
  TargetUpdatedEvent,
} from '../../targets/events/target-events.js';
import {
  NoteCreatedEvent,
  NoteDeletedEvent,
  NoteUpdatedEvent,
} from '../../notes/events/note-events.js';
import {
  EvidenceCreatedEvent,
  EvidenceDeletedEvent,
  EvidenceUpdatedEvent,
} from '../../evidence/events/evidence-events.js';
import { AttachmentUploadedEvent } from '../../attachments/events/attachment-events.js';
import { WorkspaceUpdatedEvent } from '../../workspaces/events/workspace-updated.event.js';
import {
  ReconJobCancelledEvent,
  ReconJobCompletedEvent,
  ReconJobCreatedEvent,
  ReconJobFailedEvent,
  ReconJobStartedEvent,
} from '../../recon/events/recon-job-events.js';
import { ReconFindingPromotedEvent } from '../../recon/events/recon-finding-events.js';

/// The single listener that turns every domain event into an ActivityEvent
/// row. This is what "generic enough for future modules" means in
/// practice (docs/adr/0002-workspace-foundation-module.md, Decision 2):
/// each module (Module 2's Projects/Targets/Notes/Evidence/Attachments/
/// Workspace, Module 3's Recon) just needs its own events to implement
/// ActivityDomainEvent and get added to the @EventsHandler(...) list
/// below — it never needs to know this class, this repository, or the
/// ActivityEvent table exist. Module 3 also runs a second copy of this
/// class inside the Recon worker's own process (see WorkerModule) — see
/// docs/adr/0003-recon-engine-module.md for why that's necessary
/// (@nestjs/cqrs's EventBus doesn't cross OS-process boundaries).
@EventsHandler(
  ProjectCreatedEvent,
  ProjectUpdatedEvent,
  ProjectArchivedEvent,
  ProjectRestoredEvent,
  ProjectDeletedEvent,
  ProjectFavoritedEvent,
  ProjectMemberAddedEvent,
  TargetCreatedEvent,
  TargetUpdatedEvent,
  TargetDeletedEvent,
  NoteCreatedEvent,
  NoteUpdatedEvent,
  NoteDeletedEvent,
  EvidenceCreatedEvent,
  EvidenceUpdatedEvent,
  EvidenceDeletedEvent,
  AttachmentUploadedEvent,
  WorkspaceUpdatedEvent,
  ReconJobCreatedEvent,
  ReconJobStartedEvent,
  ReconJobCompletedEvent,
  ReconJobFailedEvent,
  ReconJobCancelledEvent,
  ReconFindingPromotedEvent,
)
export class ActivityRecordingHandler implements IEventHandler<ActivityDomainEvent> {
  constructor(
    @Inject(ACTIVITY_REPOSITORY)
    private readonly activityRepository: ActivityRepository,
  ) {}

  async handle(event: ActivityDomainEvent): Promise<void> {
    await this.activityRepository.record({
      workspaceId: event.workspaceId,
      projectId: event.projectId,
      actorUserId: event.actorUserId,
      verb: event.verb,
      entityType: event.entityType,
      entityId: event.entityId,
      metadata: event.metadata,
    });
  }
}
