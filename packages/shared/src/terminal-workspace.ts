// Module 16 — Terminal workspace + safe command execution (task #388).
// AdHocCommandService executes exclusively through the existing
// ToolRunner abstraction (tool allowlist, Scope Engine check, timeout,
// resource limits, cancellation, audit log) — never a raw shell exec from
// a web request. See docs/architecture/terminal-workspace.md.

export type AdHocCommandStatus =
  | "PENDING"
  | "PENDING_APPROVAL"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED"
  | "TIMED_OUT"
  | "REJECTED";

/// Every command classification (task #388, spec section "COMMAND
/// SECURITY") — set per-entry in the server-side command registry
/// (apps/api/src/modules/terminal/command-registry.ts), never inferred
/// from the client-supplied tool string via pattern matching.
export type TerminalCommandClassification = "SAFE" | "REQUIRES_APPROVAL" | "BLOCKED";

export type TerminalCommandRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/// Which surface issued the command — descriptive/audit metadata only
/// (see AdHocCommandService's doc comment: authorization never branches
/// on this value, only on the caller's authenticated identity + the
/// Scope Engine / command registry / approval gate).
export type TerminalCommandSource = "WEB" | "DESKTOP" | "CLI" | "API" | "MCP" | "PLUGIN" | "WORKFLOW";

export interface AdHocCommandDto {
  id: string;
  workspaceId: string;
  projectId: string;
  targetId: string | null;
  tool: string;
  kind: "RECON_TOOL" | "VULN_SCANNER";
  argsSummary: string;
  classification: TerminalCommandClassification;
  status: AdHocCommandStatus;
  exitCode: number | null;
  outputPreview: string | null;
  stderrPreview: string | null;
  rejectionReason: string | null;
  approvalRequestId: string | null;
  requestedBy: string;
  source: TerminalCommandSource;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  createdAt: string;
}

export interface RunAdHocCommandRequestDto {
  targetId: string;
  tool: string;
  args: string[];
  researchSessionId?: string;
  /// Set on a follow-up call after a REQUIRES_APPROVAL command's approval
  /// request has been decided (via SECURITY_APPROVAL_ENDPOINTS.decide) —
  /// omit on the first call. AdHocCommandService re-verifies the approval
  /// server-side (SecurityApprovalService.assertApproved) rather than
  /// trusting that the client only sends this once it's actually APPROVED.
  approvalRequestId?: string;
}

/// One entry in the server-side command registry — mirrors
/// TerminalCommandDefinition in apps/api's command-registry.ts closely
/// enough to render in a command palette / picker UI without a round
/// trip per tool. `allowedTargetTypes`/`requiredPermissions` are
/// advisory for the UI; the backend re-validates independently.
export interface TerminalCommandDefinitionDto {
  name: string;
  description: string;
  kind: "RECON_TOOL" | "VULN_SCANNER";
  allowedTargetTypes: string[];
  requiredPermissions: string[];
  riskLevel: TerminalCommandRiskLevel;
  requiresApproval: boolean;
  timeoutSeconds: number;
  classification: TerminalCommandClassification;
}
