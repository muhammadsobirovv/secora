import type { ActivityDomainEvent } from '../../../common/events/activity-domain-event.interface.js';

abstract class BugReportEvent implements ActivityDomainEvent {
  abstract readonly verb: string;
  readonly entityType = 'BugReport';

  constructor(
    public readonly workspaceId: string,
    public readonly projectId: string | null,
    public readonly actorUserId: string | null,
    public readonly reportId: string,
    public readonly metadata?: Record<string, unknown>,
  ) {}

  get entityId(): string {
    return this.reportId;
  }
}

export class BugReportCreatedEvent extends BugReportEvent {
  readonly verb = 'bug_report.created';
}

export class BugReportUpdatedEvent extends BugReportEvent {
  readonly verb = 'bug_report.updated';
}

/// The five events required by the Module 6 spec's Events section beyond
/// Program/Finding — each maps to exactly one BugReportStatus transition
/// (DRAFT -> SUBMITTED, * -> ACCEPTED, * -> REJECTED, a bountyAmount being
/// set on ACCEPTED, * -> CLOSED). BountyAwarded is deliberately its own
/// event distinct from ReportAccepted: a report can be ACCEPTED with no
/// bounty (e.g. a "thank you" / hall-of-fame-only program), so a consumer
/// that only cares about actual payouts (e.g. a future earnings-tracking
/// integration) subscribes to BountyAwarded alone.
export class BugReportSubmittedEvent extends BugReportEvent {
  readonly verb = 'bug_report.submitted';
}

export class BugReportAcceptedEvent extends BugReportEvent {
  readonly verb = 'bug_report.accepted';
}

export class BugReportRejectedEvent extends BugReportEvent {
  readonly verb = 'bug_report.rejected';
}

export class BountyAwardedEvent extends BugReportEvent {
  readonly verb = 'bug_report.bounty_awarded';
}

export class BugReportClosedEvent extends BugReportEvent {
  readonly verb = 'bug_report.closed';
}
