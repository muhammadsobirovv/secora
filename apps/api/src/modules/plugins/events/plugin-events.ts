import type { IEvent } from '@nestjs/cqrs';
import type { ActivityDomainEvent } from '../../../common/events/activity-domain-event.interface.js';

/// Plugin installs/uninstalls are workspace-scoped actions (a specific
/// workspace opted into a plugin), so — unlike most of Module 10, which
/// is organization/tenant-scoped and uses the AuditEvent trail the same
/// way Module 9's WORKSPACE_MEMBER_* events do — these two genuinely fit
/// the Activity Timeline's shape and are wired into the existing generic
/// `ActivityRecordingHandler` (Module 2) rather than inventing a second
/// timeline. Only fired when `workspaceId` is present (an org-wide
/// installation with no specific workspace has nothing to attribute the
/// activity to).
export class PluginInstalledEvent implements IEvent, ActivityDomainEvent {
  readonly projectId = null;
  readonly verb = 'installed';
  readonly entityType = 'PLUGIN';

  constructor(
    public readonly workspaceId: string,
    public readonly actorUserId: string,
    public readonly entityId: string,
    public readonly metadata: Record<string, unknown>,
  ) {}
}

export class PluginUninstalledEvent implements IEvent, ActivityDomainEvent {
  readonly projectId = null;
  readonly verb = 'uninstalled';
  readonly entityType = 'PLUGIN';

  constructor(
    public readonly workspaceId: string,
    public readonly actorUserId: string,
    public readonly entityId: string,
    public readonly metadata: Record<string, unknown>,
  ) {}
}
