/// Module 17 — task #487 (Automation rules engine). Published by
/// `VulnerabilityMatchingService.runForTarget` (via the global
/// `CqrsModule.forRoot()` `EventBus`) only when a newly-created (or
/// re-confirmed) `CveMatch` points at a `CveRecord` whose
/// `isKnownExploited` flag is set — the CISA KEV signal already cached by
/// `CveIntelligenceService`. Deliberately narrower than every CveMatch:
/// an automation rule reacting to "a technology name loosely matched a
/// CVE description" would be far too noisy (see that service's own class
/// doc comment on why raw CveMatch confidence stays capped well below
/// "confirmed") — KEV membership is the one binary, externally-verified
/// signal worth an unattended trigger.
export class KevMatchEvent {
  constructor(
    public readonly workspaceId: string,
    public readonly cveMatchId: string,
    public readonly cveId: string,
    public readonly targetId: string | null,
    public readonly findingId: string | null,
  ) {}
}
