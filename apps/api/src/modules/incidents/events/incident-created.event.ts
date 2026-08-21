/// Module 17 — task #482 (Notification engine extensions). Published by
/// `IncidentsService.create` (via the global `CqrsModule.forRoot()`
/// `EventBus` — no module import needed, same pattern as
/// `SlaBreachedEvent`/`IndicatorMatchedEvent`) once a new `Incident` row
/// has already been durably written. `SocNotificationsModule` owns the
/// one subscriber for this event today; `IncidentsModule` itself has no
/// knowledge of notifications, which is what keeps this event-driven
/// rather than a direct injected call.
export class IncidentCreatedEvent {
  constructor(
    public readonly workspaceId: string,
    public readonly incidentId: string,
    public readonly severity: string,
    public readonly title: string,
    public readonly reporterId: string,
  ) {}
}
