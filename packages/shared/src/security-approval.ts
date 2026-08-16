// Module 16 — Approval gates + Global Security Policy (tasks #399-400).
// Deliberately separate from Module 10's Organization-scoped
// ApprovalWorkflow/ApprovalRequest — see schema.prisma's
// SecurityApprovalRequest doc comment and ADR 0016 §5 for why.

export type SecurityApprovalRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type SecurityApprovalStatus = "PENDING" | "APPROVED" | "DENIED" | "EXPIRED" | "CANCELLED";

/// Operation types that MUST go through an approval gate before running,
/// per spec section 38. Not exhaustive — GlobalSecurityPolicy.requireApprovalFor
/// can add workspace-specific ones, but these are never skippable.
export type HighRiskOperationType =
  | "LARGE_SCALE_SCAN"
  | "DESTRUCTIVE_COMMAND"
  | "ABOVE_DEFAULT_CONCURRENCY"
  | "EXTERNAL_INTEGRATION_CALL"
  | "AUTOMATED_SUBMISSION"
  | "AI_INVESTIGATION_PLAN"
  | "AI_INVESTIGATION_TOOL_STEP";

export interface SecurityApprovalRequestDto {
  id: string;
  requestedBy: string;
  operationType: string;
  riskLevel: SecurityApprovalRiskLevel;
  resourceType: string;
  resourceId: string | null;
  reason: string | null;
  payload: unknown;
  status: SecurityApprovalStatus;
  decidedBy: string | null;
  decisionNote: string | null;
  expiresAt: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface CreateSecurityApprovalRequestDto {
  operationType: HighRiskOperationType | string;
  riskLevel: SecurityApprovalRiskLevel;
  resourceType: string;
  resourceId?: string;
  reason?: string;
  payload?: unknown;
  expiresInMinutes?: number;
}

export interface DecideSecurityApprovalRequestDto {
  approve: boolean;
  decisionNote?: string;
}

export interface GlobalSecurityPolicyDto {
  workspaceId: string;
  maxScanRatePerMinute: number | null;
  maxConcurrentJobs: number | null;
  allowedTools: string[] | null;
  blockedTools: string[] | null;
  allowedTargetTypes: string[] | null;
  requireApprovalFor: string[] | null;
  dataRetentionDays: number | null;
  evidenceRetentionDays: number | null;
  aiToolPermissions: Record<string, boolean> | null;
  pluginPermissions: Record<string, boolean> | null;
  updatedBy: string;
  updatedAt: string;
}

export interface UpdateGlobalSecurityPolicyRequestDto {
  maxScanRatePerMinute?: number | null;
  maxConcurrentJobs?: number | null;
  allowedTools?: string[] | null;
  blockedTools?: string[] | null;
  allowedTargetTypes?: string[] | null;
  requireApprovalFor?: string[] | null;
  dataRetentionDays?: number | null;
  evidenceRetentionDays?: number | null;
  aiToolPermissions?: Record<string, boolean> | null;
  pluginPermissions?: Record<string, boolean> | null;
}
