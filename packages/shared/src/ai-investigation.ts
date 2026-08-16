// Module 16 — AI Investigation Mode (task #398). Controlled autonomy:
// plan -> approval -> scope-gated tool execution -> correlation ->
// proposed findings -> human validation. Never bypasses the Scope Engine
// or Approval Gate, at any step, under any condition.

// 8-state lifecycle, matching Prisma's AiInvestigationStatus enum literally:
// DRAFT (plan being composed) -> AWAITING_APPROVAL (submitted, a
// SecurityApprovalRequest exists) -> APPROVED (approval granted, not yet
// started) -> RUNNING -> PAUSED/COMPLETED/FAILED/CANCELLED. APPROVED is
// deliberately distinct from RUNNING: the Scope Engine / ToolRunner gate is
// re-checked at RUNNING transition time, not folded into the approval
// decision, so "approved but nothing executed yet" must be observable.
export type AiInvestigationStatus =
  | "DRAFT" | "AWAITING_APPROVAL" | "APPROVED" | "RUNNING" | "PAUSED" | "COMPLETED" | "FAILED" | "CANCELLED";

export type AiInvestigationStepStatus =
  | "PENDING" | "AWAITING_APPROVAL" | "RUNNING" | "SUCCEEDED" | "FAILED" | "SKIPPED";

export interface AiInvestigationPlanStepDto {
  stepIndex: number;
  kind: string;
  description: string;
  toolName: string | null;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export interface AiInvestigationStepDto {
  id: string;
  stepIndex: number;
  kind: string;
  description: string;
  toolName: string | null;
  status: AiInvestigationStepStatus;
  approvalRequestId: string | null;
  output: unknown;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface AiInvestigationSessionDto {
  id: string;
  workspaceId: string;
  projectId: string;
  targetId: string;
  researchSessionId: string | null;
  goal: string;
  status: AiInvestigationStatus;
  plan: AiInvestigationPlanStepDto[] | null;
  approvalRequestId: string | null;
  failureReason: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  steps: AiInvestigationStepDto[];
}

export interface StartAiInvestigationRequestDto {
  targetId: string;
  goal: string;
  researchSessionId?: string;
}

export interface AiInvestigationProposedFindingDto {
  title: string;
  description: string;
  severity: string;
  vulnType: string | null;
  endpoint: string | null;
  confidence: number;
  sourceStepIds: string[];
}
