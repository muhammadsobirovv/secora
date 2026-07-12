import type { ActivityDomainEvent } from '../../../common/events/activity-domain-event.interface.js';

export class ReconFindingPromotedEvent implements ActivityDomainEvent {
  readonly verb = 'recon_finding.promoted';
  readonly entityType = 'ReconFinding';

  constructor(
    public readonly workspaceId: string,
    public readonly projectId: string,
    public readonly actorUserId: string,
    public readonly findingId: string,
    public readonly metadata?: Record<string, unknown>,
  ) {}

  get entityId(): string {
    return this.findingId;
  }
}
