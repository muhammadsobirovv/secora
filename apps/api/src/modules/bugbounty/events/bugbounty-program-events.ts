import type { ActivityDomainEvent } from '../../../common/events/activity-domain-event.interface.js';

abstract class BugBountyProgramEvent implements ActivityDomainEvent {
  abstract readonly verb: string;
  readonly entityType = 'BugBountyProgram';

  constructor(
    public readonly workspaceId: string,
    public readonly projectId: string | null,
    public readonly actorUserId: string | null,
    public readonly programId: string,
    public readonly metadata?: Record<string, unknown>,
  ) {}

  get entityId(): string {
    return this.programId;
  }
}

/// Required by the Module 6 spec's Events section — every future module
/// (and the Activity Timeline, via ActivityRecordingHandler) can subscribe
/// without ever touching bugbounty.module.ts.
export class BugBountyProgramCreatedEvent extends BugBountyProgramEvent {
  readonly verb = 'bugbounty_program.created';
}

export class BugBountyProgramUpdatedEvent extends BugBountyProgramEvent {
  readonly verb = 'bugbounty_program.updated';
}
