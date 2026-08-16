// Module 16 — Scope Engine + pre-execution validation gate (task #370).
// The single most safety-critical piece of this module: every automated
// tool execution (Recon job, Vuln scan, ad-hoc Terminal command, AI
// Investigation step) must pass `ScopeEngineService.assertExecutionAllowed()`
// before it runs. See docs/architecture/scope-engine.md.

export type ScopeDecision = "ALLOWED" | "DENIED_OUT_OF_SCOPE" | "DENIED_PENDING_REVIEW" | "DENIED_POLICY";

export interface ScopeValidationResultDto {
  decision: ScopeDecision;
  targetId: string;
  targetScopeStatus: "IN_SCOPE" | "OUT_OF_SCOPE" | "PENDING_REVIEW";
  matchedProgramScopeItemId: string | null;
  matchedProgramScopeClassification: "IN_SCOPE" | "OUT_OF_SCOPE" | "UNKNOWN" | "REVIEW_NEEDED" | "DEPRECATED" | null;
  reason: string;
  evaluatedAt: string;
}
