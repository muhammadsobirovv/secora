import type { ActivityDomainEvent } from '../../../common/events/activity-domain-event.interface.js';

/// Mirrors ReconJobEvent (Module 3) field-for-field, plus Paused/Resumed —
/// the two extra lifecycle transitions Module 3 never had.
abstract class VulnScanJobEvent implements ActivityDomainEvent {
  abstract readonly verb: string;
  readonly entityType = 'VulnScanJob';

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

export class VulnScanJobCreatedEvent extends VulnScanJobEvent {
  readonly verb = 'vuln_scan_job.created';
}

export class VulnScanJobStartedEvent extends VulnScanJobEvent {
  readonly verb = 'vuln_scan_job.started';
}

/// The spec's "ScanCompleted" event — this is the class that satisfies it.
/// Also the explicit AI-Summary/Report-Generator seam (pipeline diagram:
/// ... -> Activity Timeline -> Future AI Hook): a future module subscribes
/// to this event to generate its own output. No such logic exists here —
/// this class is only ever published, never consumed, in this module.
export class VulnScanJobCompletedEvent extends VulnScanJobEvent {
  readonly verb = 'vuln_scan_job.completed';
}

export class VulnScanJobFailedEvent extends VulnScanJobEvent {
  readonly verb = 'vuln_scan_job.failed';
}

export class VulnScanJobCancelledEvent extends VulnScanJobEvent {
  readonly verb = 'vuln_scan_job.cancelled';
}

export class VulnScanJobPausedEvent extends VulnScanJobEvent {
  readonly verb = 'vuln_scan_job.paused';
}

export class VulnScanJobResumedEvent extends VulnScanJobEvent {
  readonly verb = 'vuln_scan_job.resumed';
}
