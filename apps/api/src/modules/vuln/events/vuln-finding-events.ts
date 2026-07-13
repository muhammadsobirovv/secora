import type { ActivityDomainEvent } from '../../../common/events/activity-domain-event.interface.js';

abstract class VulnFindingEvent implements ActivityDomainEvent {
  abstract readonly verb: string;
  readonly entityType = 'VulnFinding';

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

/// Published once per finding the first time a (targetId, scanner,
/// dedupKey) combination is seen — see
/// VulnScanJobExecutionService.persistToolResult, which distinguishes
/// insert vs. update using VulnFindingsRepository.upsertMany's
/// `wasCreated` flag so this and FindingUpdated below are never both
/// published for the same upsert.
export class VulnFindingCreatedEvent extends VulnFindingEvent {
  readonly verb = 'vuln_finding.created';
}

/// Published on every re-match of an already-known finding (data/
/// lastSeenAt refreshed by a later scan) — NOT published for an
/// analyst-driven status change; UpdateFindingStatusCommand always
/// publishes this too, but additionally publishes FindingConfirmed/
/// FindingResolved (see below) when the transition warrants it, so a
/// consumer that only cares about triage state changes can subscribe to
/// just those two instead of every FindingUpdated.
export class VulnFindingUpdatedEvent extends VulnFindingEvent {
  readonly verb = 'vuln_finding.updated';
}

/// Published in addition to FindingUpdated specifically when an analyst
/// sets status to CONFIRMED.
export class VulnFindingConfirmedEvent extends VulnFindingEvent {
  readonly verb = 'vuln_finding.confirmed';
}

/// Published in addition to FindingUpdated when an analyst sets status to
/// one of the three "resolved" terminal states (FIXED, FALSE_POSITIVE,
/// ACCEPTED_RISK) — a single event for "this finding no longer needs
/// attention," regardless of which of the three specific resolutions it
/// was, since most timeline/notification consumers only care that it's
/// resolved, not which way.
export class VulnFindingResolvedEvent extends VulnFindingEvent {
  readonly verb = 'vuln_finding.resolved';
}
