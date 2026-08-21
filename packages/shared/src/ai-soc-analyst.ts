// Module 17 — AI SOC Analyst service (task #471, spec sections 10/38).
//
// Read-only and advisory by construction: this service never creates,
// updates, or deletes an Incident/RemediationTask/finding severity, and
// never executes a tool. Its one side effect is appending a single
// `AI_ANALYSIS` row to the Incident's append-only timeline (visible,
// auditable, never mutates the incident itself) — every other field
// below is returned directly to the caller for a human to act on.
// `confidenceLevel` and `caveats` exist specifically so the model is
// never presented as more certain than the underlying evidence supports
// — per the platform-wide rule that AI must not declare compromise as
// fact without evidence.

import type { IncidentSeverity } from "./soc-threat-intel.js";

export type AiSocConfidenceLevel = "LOW" | "MEDIUM" | "HIGH";

/// One evidence item actually supplied to the model in its prompt —
/// echoed back here so a reader can verify every claim in `summary`/
/// `likelyRootCause` traces to something real, not a fabricated detail.
export interface AiSocEvidenceItemDto {
  kind: "FINDING" | "RISK_SNAPSHOT" | "CORRELATION_INSIGHT";
  refId: string;
  label: string;
}

export interface AnalyzeIncidentResponseDto {
  incidentId: string;
  /// Plain-language summary of what the linked evidence shows — the
  /// system prompt instructs the model to describe only what the
  /// evidence supports, never to assert compromise/root cause as a
  /// settled fact.
  summary: string;
  /// A hedged, evidence-grounded hypothesis, never phrased as certain.
  likelyRootCause: string;
  confidenceLevel: AiSocConfidenceLevel;
  /// A *suggestion* only — applying it requires the human to call the
  /// existing incident update path themselves; this service never
  /// writes it to the Incident row.
  recommendedSeverity: IncidentSeverity | null;
  recommendedActions: string[];
  /// Explicit gaps/uncertainties/things the model could not verify from
  /// the supplied evidence — always populated when evidence is thin,
  /// never omitted to make the analysis look more confident.
  caveats: string[];
  evidence: AiSocEvidenceItemDto[];
  timelineEventId: string;
  generatedAt: string;
  /// `null` when the deterministic (no-AI-provider-configured) fallback
  /// was used — see the service's own doc comment on the Community
  /// Edition guarantee this preserves.
  providerName: string | null;
  model: string | null;
}
