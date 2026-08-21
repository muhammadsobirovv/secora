// Module 17 — task #472. AI Investigation Workflow, defensive lifecycle
// extension of Module 16's AI Investigation Mode (`ai-investigation.ts`).
// Same controlled-autonomy shape (plan -> approval -> execution), but
// scoped to an `Incident` instead of a `Target`, and every step kind is
// a read-only investigative action (AI analysis, threat-intel lookup,
// correlation review, evidence review) — never a job that mutates
// external systems or executes an offensive tool. Never bypasses the
// Approval Gate, at any step, under any condition — see
// `IncidentInvestigationService`'s class doc comment.

// 8-state lifecycle, matching Prisma's IncidentInvestigationStatus enum
// literally — same shape as `AiInvestigationStatus` (kept as a distinct
// type so the two lifecycles can diverge independently).
export type IncidentInvestigationStatus =
  | "DRAFT" | "AWAITING_APPROVAL" | "APPROVED" | "RUNNING" | "PAUSED" | "COMPLETED" | "FAILED" | "CANCELLED";

export type IncidentInvestigationStepStatus =
  | "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "SKIPPED";

// Fixed allowlist of read-only step kinds — an AI-proposed `kind` outside
// this list is always downgraded to MANUAL_REVIEW by the service, never
// executed as-is.
export type IncidentInvestigationStepKind =
  | "AI_ANALYSIS" | "THREAT_INTEL_LOOKUP" | "CORRELATION_REVIEW" | "EVIDENCE_REVIEW" | "MANUAL_REVIEW";

export interface IncidentInvestigationPlanStepDto {
  stepIndex: number;
  kind: IncidentInvestigationStepKind;
  description: string;
}

export interface IncidentInvestigationStepDto {
  id: string;
  stepIndex: number;
  kind: string;
  description: string;
  status: IncidentInvestigationStepStatus;
  output: unknown;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface IncidentInvestigationSessionDto {
  id: string;
  workspaceId: string;
  incidentId: string;
  goal: string;
  status: IncidentInvestigationStatus;
  plan: IncidentInvestigationPlanStepDto[] | null;
  approvalRequestId: string | null;
  failureReason: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  steps: IncidentInvestigationStepDto[];
}

export interface StartIncidentInvestigationRequestDto {
  incidentId: string;
  goal: string;
}
