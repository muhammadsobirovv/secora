import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import type { ActivityDomainEvent } from '../../common/events/activity-domain-event.interface.js';
import type { RealtimeDomainEventDto, RealtimeEventCategory } from '@pentesthub/shared';
import {
  BugBountyFindingCreatedEvent,
  BugBountyFindingReportedEvent,
  BugBountyFindingStageChangedEvent,
} from '../bugbounty/events/bugbounty-finding-events.js';
import {
  VulnFindingConfirmedEvent,
  VulnFindingCreatedEvent,
  VulnFindingResolvedEvent,
  VulnFindingUpdatedEvent,
} from '../vuln/events/vuln-finding-events.js';
import {
  ReconJobCompletedEvent,
  ReconJobFailedEvent,
  ReconJobStartedEvent,
} from '../recon/events/recon-job-events.js';
import {
  VulnScanJobCompletedEvent,
  VulnScanJobFailedEvent,
  VulnScanJobStartedEvent,
} from '../vuln/events/vuln-scan-job-events.js';
import { CommentCreatedEvent, MentionCreatedEvent } from '../collaboration/events/comment-events.js';
import { RealtimeHubService } from './realtime-hub.service.js';

const CATEGORY_BY_EVENT = new Map<string, RealtimeEventCategory>([
  [BugBountyFindingCreatedEvent.name, 'FINDING'],
  [BugBountyFindingStageChangedEvent.name, 'FINDING'],
  [BugBountyFindingReportedEvent.name, 'FINDING'],
  [VulnFindingCreatedEvent.name, 'FINDING'],
  [VulnFindingUpdatedEvent.name, 'FINDING'],
  [VulnFindingConfirmedEvent.name, 'FINDING'],
  [VulnFindingResolvedEvent.name, 'FINDING'],
  [ReconJobStartedEvent.name, 'JOB'],
  [ReconJobCompletedEvent.name, 'JOB'],
  [ReconJobFailedEvent.name, 'JOB'],
  [VulnScanJobStartedEvent.name, 'JOB'],
  [VulnScanJobCompletedEvent.name, 'JOB'],
  [VulnScanJobFailedEvent.name, 'JOB'],
  [CommentCreatedEvent.name, 'COMMENT'],
  [MentionCreatedEvent.name, 'NOTIFICATION'],
]);

/// Module 16 — Real-time gateway (task #391). Bridges the existing
/// `EventBus` (the same domain events `ActivityRecordingHandler` and
/// `WebhookDispatchHandler` already subscribe to — see their doc
/// comments) into `RealtimeHubService`'s per-workspace SSE stream. This
/// is a deliberately curated subset — "live finding+job+comment+
/// activity/notification events" (spec) — not literally every event
/// class in the platform the way `ActivityRecordingHandler`'s list is;
/// widening it later is just adding another class to both the
/// `@EventsHandler(...)` list and `CATEGORY_BY_EVENT` above.
///
/// `MentionCreatedEvent` carries a `mentionedUserId` (the one field no
/// other `ActivityDomainEvent` in this codebase has) which becomes
/// `targetUserId` on the outgoing `RealtimeDomainEventDto` — the SSE
/// controller only delivers events with a `targetUserId` down that
/// specific person's own connection, never workspace-broadcast (see
/// RealtimeController.stream()).
@EventsHandler(
  BugBountyFindingCreatedEvent,
  BugBountyFindingStageChangedEvent,
  BugBountyFindingReportedEvent,
  VulnFindingCreatedEvent,
  VulnFindingUpdatedEvent,
  VulnFindingConfirmedEvent,
  VulnFindingResolvedEvent,
  ReconJobStartedEvent,
  ReconJobCompletedEvent,
  ReconJobFailedEvent,
  VulnScanJobStartedEvent,
  VulnScanJobCompletedEvent,
  VulnScanJobFailedEvent,
  CommentCreatedEvent,
  MentionCreatedEvent,
)
export class RealtimePublishHandler implements IEventHandler<ActivityDomainEvent> {
  constructor(private readonly hub: RealtimeHubService) {}

  handle(event: ActivityDomainEvent): void {
    const category = CATEGORY_BY_EVENT.get(event.constructor.name);
    if (!category) return;

    const targetUserId =
      'mentionedUserId' in event ? (event as unknown as { mentionedUserId: string }).mentionedUserId : null;

    const payload: RealtimeDomainEventDto = {
      category,
      verb: event.verb,
      entityType: event.entityType,
      entityId: event.entityId,
      workspaceId: event.workspaceId,
      projectId: event.projectId,
      actorUserId: event.actorUserId,
      targetUserId,
      metadata: event.metadata,
      occurredAt: new Date().toISOString(),
    };

    this.hub.publish(event.workspaceId, payload);
  }
}
