/// Module 17 — task #487 (Automation rules engine). Published by
/// `SlaService.checkForBreaches` (via the global `CqrsModule.forRoot()`
/// `EventBus` — no module import needed) once per newly-recorded
/// `SlaEvent` row of type `BREACHED`. `AutomationRulesModule` owns the
/// one subscriber for this event (see its handlers/ folder) — `SlaModule`
/// itself has no knowledge of automation rules, which is what keeps this
/// event-driven rather than a direct injected call and avoids a circular
/// module dependency (`AutomationRulesModule` already imports
/// `IncidentsModule`, which imports `SlaModule`).
export class SlaBreachedEvent {
  constructor(
    public readonly workspaceId: string,
    public readonly slaEventId: string,
    public readonly severity: string,
    public readonly incidentId: string | null,
    public readonly findingId: string | null,
  ) {}
}
