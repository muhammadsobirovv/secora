/// Module 17 — task #487 (Automation rules engine). Published by
/// `FindingCorrelationService.runForTarget` (via the global
/// `CqrsModule.forRoot()` `EventBus`) once per `NEW_ASSET_POTENTIAL_EXPOSURE`
/// or `NEW_SERVICE_POTENTIAL_EXPOSURE` `CorrelationInsight` it records —
/// both insights only exist because `detectChangeIntelligence` scoped its
/// read to the current recon run's `ChangeDetectionEvent` rows (see that
/// method's doc comment), so this event, too, only fires for genuinely
/// new attack surface, never a re-derivation of already-known state.
export class NewInternetFacingAssetEvent {
  constructor(
    public readonly workspaceId: string,
    public readonly targetId: string,
    public readonly kind: 'NEW_ASSET_POTENTIAL_EXPOSURE' | 'NEW_SERVICE_POTENTIAL_EXPOSURE',
    public readonly severity: string | null,
    public readonly title: string,
  ) {}
}
