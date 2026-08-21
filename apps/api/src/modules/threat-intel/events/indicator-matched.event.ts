/// Module 17 — task #487 (Automation rules engine). Published by
/// `ThreatMatchService.upsertMatch` (via the global `CqrsModule.forRoot()`
/// `EventBus`) only when a brand-new `ThreatMatch` row is created — not
/// on a re-run that just refreshes confidence/evidence for an existing
/// one, so a rule with `triggerType: 'INDICATOR_MATCH'` fires once per
/// genuinely new correlation, not once per Recon job that happens to
/// re-confirm an already-known match.
export class IndicatorMatchedEvent {
  constructor(
    public readonly workspaceId: string,
    public readonly threatMatchId: string,
    public readonly indicatorType: string,
    public readonly confidence: number,
    public readonly targetId: string | null,
  ) {}
}
