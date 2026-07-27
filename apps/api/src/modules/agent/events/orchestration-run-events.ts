import type { ActivityDomainEvent } from '../../../common/events/activity-domain-event.interface.js';

/// Module 11 — Controllers + Swagger + module wiring + events (task #236).
/// Mirrors VulnScanJobEvent (Module 4)/ReconJobEvent (Module 3) field-for-
/// field — an OrchestrationRun is this module's equivalent long-running
/// background job, so it gets the same lifecycle-event treatment feeding
/// the same generic ActivityRecordingHandler (see that class's doc
/// comment: "a future module just needs its events to implement
/// ActivityDomainEvent and get added to the @EventsHandler(...) list").
abstract class OrchestrationRunEvent implements ActivityDomainEvent {
  abstract readonly verb: string;
  readonly entityType = 'OrchestrationRun';

  constructor(
    public readonly workspaceId: string,
    public readonly projectId: string | null,
    public readonly actorUserId: string | null,
    public readonly orchestrationRunId: string,
    public readonly metadata?: Record<string, unknown>,
  ) {}

  get entityId(): string {
    return this.orchestrationRunId;
  }
}

export class OrchestrationRunCreatedEvent extends OrchestrationRunEvent {
  readonly verb = 'orchestration_run.created';
}

export class OrchestrationRunCompletedEvent extends OrchestrationRunEvent {
  readonly verb = 'orchestration_run.completed';
}

export class OrchestrationRunFailedEvent extends OrchestrationRunEvent {
  readonly verb = 'orchestration_run.failed';
}

export class OrchestrationRunCancelledEvent extends OrchestrationRunEvent {
  readonly verb = 'orchestration_run.cancelled';
}
