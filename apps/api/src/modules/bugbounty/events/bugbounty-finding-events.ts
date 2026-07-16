import type { ActivityDomainEvent } from '../../../common/events/activity-domain-event.interface.js';

abstract class BugBountyFindingEvent implements ActivityDomainEvent {
  abstract readonly verb: string;
  readonly entityType = 'BugBountyFinding';

  constructor(
    public readonly workspaceId: string,
    public readonly projectId: string,
    public readonly actorUserId: string | null,
    public readonly findingId: string,
    public readonly metadata?: Record<string, unknown>,
  ) {}

  get entityId(): string {
    return this.findingId;
  }
}

export class BugBountyFindingCreatedEvent extends BugBountyFindingEvent {
  readonly verb = 'bugbounty_finding.created';
}

/// One event per lifecycle transition (New -> Triaged -> Verified ->
/// Reported -> Duplicate/NeedMoreInfo -> Resolved -> Closed -> Archived —
/// see BugBountyFindingStage), each generating its own Activity Event
/// (spec: "Each state change must generate Activity Events").
export class BugBountyFindingStageChangedEvent extends BugBountyFindingEvent {
  readonly verb = 'bugbounty_finding.stage_changed';
}

/// Required by the Module 6 spec's Events section — published specifically
/// on the New/Triaged/Verified -> Reported transition (i.e. once a
/// BugReport is actually submitted against this finding), distinct from
/// the generic StageChanged event above so a consumer that only cares
/// about "this became a real report" doesn't have to filter every
/// intermediate transition.
export class BugBountyFindingReportedEvent extends BugBountyFindingEvent {
  readonly verb = 'bugbounty_finding.reported';
}
