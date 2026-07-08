/// Every Module 2 domain event implements this shape so the `activity`
/// module's single ActivityRecordingHandler can turn any of them into an
/// ActivityEvent row without knowing about each feature module's
/// internals — this is what makes the timeline "generic enough for
/// future modules" (docs/adr/0002-workspace-foundation-module.md,
/// Decision 2): a future module just needs its events to implement this
/// interface, not register with `activity` directly.
export interface ActivityDomainEvent {
  workspaceId: string;
  projectId: string | null;
  actorUserId: string | null;
  verb: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}
