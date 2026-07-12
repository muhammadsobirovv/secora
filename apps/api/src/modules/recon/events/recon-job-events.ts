import type { ActivityDomainEvent } from '../../../common/events/activity-domain-event.interface.js';

abstract class ReconJobEvent implements ActivityDomainEvent {
  abstract readonly verb: string;
  readonly entityType = 'ReconJob';

  constructor(
    public readonly workspaceId: string,
    public readonly projectId: string,
    public readonly actorUserId: string | null,
    public readonly jobId: string,
    public readonly metadata?: Record<string, unknown>,
  ) {}

  get entityId(): string {
    return this.jobId;
  }
}

export class ReconJobCreatedEvent extends ReconJobEvent {
  readonly verb = 'recon_job.created';
}

export class ReconJobStartedEvent extends ReconJobEvent {
  readonly verb = 'recon_job.started';
}

/// The explicit AI-Summary seam from the pipeline diagram (Target -> ...
/// -> Activity Timeline -> AI Summary): a future AI module subscribes to
/// this event to generate its summary. No AI logic exists in this module
/// — this class is only ever published, never consumed here.
export class ReconJobCompletedEvent extends ReconJobEvent {
  readonly verb = 'recon_job.completed';
}

export class ReconJobFailedEvent extends ReconJobEvent {
  readonly verb = 'recon_job.failed';
}

export class ReconJobCancelledEvent extends ReconJobEvent {
  readonly verb = 'recon_job.cancelled';
}
