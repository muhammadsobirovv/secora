/// Module 17 — task #486 (SOC Event Bus wiring). Published by
/// `RemediationService.setStatus` (via the global `CqrsModule.forRoot()`
/// `EventBus` — no module import needed, same pattern as
/// `IncidentCreatedEvent`/`SlaBreachedEvent`/`IndicatorMatchedEvent`)
/// once a `RemediationTask` has actually transitioned to CLOSED — never
/// on any other status change, and only after the CLOSED guard in
/// `setStatus` (spec section 22 — "verification must require actual
/// evidence") has already passed, so a subscriber can treat this as "a
/// fix was verified and closed," not just "someone edited the status."
/// `SocNotificationsModule` owns the one subscriber for this event
/// today; `RemediationModule` itself has no knowledge of notifications.
export class RemediationTaskClosedEvent {
  constructor(
    public readonly workspaceId: string,
    public readonly remediationTaskId: string,
    public readonly findingId: string | null,
    public readonly incidentId: string | null,
    public readonly priority: string,
  ) {}
}
