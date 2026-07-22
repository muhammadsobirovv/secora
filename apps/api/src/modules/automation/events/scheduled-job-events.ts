import type { ActivityDomainEvent } from '../../../common/events/activity-domain-event.interface.js';

/// Module 10 addition. Module 9's ScheduledJobRunnerService recorded a
/// ScheduledJobRun row on every tick but never published a domain event,
/// so scheduled-job completions were invisible to the Activity Timeline
/// and to the (also new in Module 10) webhook dispatcher. `actorUserId`
/// is always null — a scheduled run has no human actor, same convention
/// PluginInstalledEvent and other system-triggered events use elsewhere
/// in this codebase.
abstract class ScheduledJobRunEvent implements ActivityDomainEvent {
  abstract readonly verb: string;
  readonly entityType = 'ScheduledJobRun';
  readonly actorUserId: string | null = null;

  constructor(
    public readonly workspaceId: string,
    public readonly projectId: string | null,
    public readonly runId: string,
    public readonly metadata?: Record<string, unknown>,
  ) {}

  get entityId(): string {
    return this.runId;
  }
}

export class ScheduledJobRunCompletedEvent extends ScheduledJobRunEvent {
  readonly verb = 'scheduled_job.completed';
}

export class ScheduledJobRunFailedEvent extends ScheduledJobRunEvent {
  readonly verb = 'scheduled_job.failed';
}
