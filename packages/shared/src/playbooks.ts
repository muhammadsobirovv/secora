// Module 16 — Playbooks + Playbook Builder (task #389).
//
// A playbook's step graph and variable declarations are versioned as one
// atomic JSON document per PlaybookVersion (see schema.prisma's doc
// comment on that model for why PlaybookStep/PlaybookVariable are not
// separate SQL tables) — this file is the shape of that JSON.

export type PlaybookStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export type PlaybookExecutionStatus =
  | "PENDING"
  | "RUNNING"
  | "WAITING_APPROVAL"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type PlaybookExecutionStepStatus =
  | "PENDING"
  | "RUNNING"
  | "WAITING_APPROVAL"
  | "SKIPPED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type PlaybookApprovalStatus = "WAITING_APPROVAL" | "APPROVED" | "REJECTED" | "EXPIRED";

/// Spec section "PLAYBOOK STEP TYPES" — one entry per named type.
export type PlaybookStepType =
  | "TARGET"
  | "SCOPE_VALIDATION"
  | "RECON"
  | "HTTP_PROBE"
  | "PORT_SCAN"
  | "TECHNOLOGY_DETECTION"
  | "VULNERABILITY_SCAN"
  | "AI_ANALYSIS"
  | "FINDING_CREATION"
  | "EVIDENCE_COLLECTION"
  | "REPORT_GENERATION"
  | "NOTIFICATION"
  | "WEBHOOK"
  | "APPROVAL"
  | "CONDITION"
  | "PARALLEL"
  | "DELAY"
  | "EXPORT";

/// Spec section "PLAYBOOK CONDITIONS" — deterministic, evaluated against
/// the execution's accumulated `PlaybookExecutionContext` (see the
/// engine), never against anything an AI step produced un-validated.
export type PlaybookConditionOperator =
  | "GT"
  | "GTE"
  | "LT"
  | "LTE"
  | "EQ"
  | "NEQ"
  | "CONTAINS"
  | "EXISTS";

export interface PlaybookCondition {
  /// What to read from the execution context — a small closed set, not a
  /// free-form expression language (keeps conditions auditable: you can
  /// enumerate every possible condition a playbook could ever evaluate).
  field:
    | "ASSET_COUNT"
    | "FINDING_SEVERITY"
    | "TECHNOLOGY"
    | "PORT"
    | "RECON_COMPLETED"
    | "SCAN_COMPLETED"
    | "CVE_MATCH_CONFIDENCE";
  operator: PlaybookConditionOperator;
  value: string | number;
}

export interface PlaybookNode {
  id: string;
  type: PlaybookStepType;
  label: string;
  /// Step-type-specific configuration — e.g. `{ tools: ["SUBFINDER"] }`
  /// for RECON, `{ condition: {...} }` for CONDITION, `{ delaySeconds: 30
  /// }` for DELAY. Validated per-type by PlaybookValidationService before
  /// a version can be published.
  config: Record<string, unknown>;
  position?: { x: number; y: number };
}

export interface PlaybookEdge {
  id: string;
  from: string;
  to: string;
  /// Present only on edges leaving a CONDITION node — `true`/`false`
  /// branch. Absent on every other edge (unconditional "next step").
  branch?: "true" | "false";
}

export interface PlaybookVariableDefinition {
  name: string;
  label: string;
  type: "STRING" | "NUMBER" | "BOOLEAN" | "TARGET_TYPE";
  required: boolean;
  defaultValue?: string | number | boolean;
}

export interface PlaybookGraph {
  nodes: PlaybookNode[];
  edges: PlaybookEdge[];
}

export interface PlaybookDto {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  category: string;
  isBuiltIn: boolean;
  status: PlaybookStatus;
  currentVersionId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface PlaybookVersionDto {
  id: string;
  playbookId: string;
  version: number;
  graph: PlaybookGraph;
  variables: PlaybookVariableDefinition[];
  publishedAt: string | null;
  publishedBy: string | null;
  createdBy: string;
  createdAt: string;
}

export interface CreatePlaybookRequestDto {
  name: string;
  description?: string;
  category: string;
  graph: PlaybookGraph;
  variables?: PlaybookVariableDefinition[];
}

export interface UpdatePlaybookDraftRequestDto {
  name?: string;
  description?: string;
  category?: string;
  graph?: PlaybookGraph;
  variables?: PlaybookVariableDefinition[];
}

export interface PlaybookValidationIssueDto {
  severity: "ERROR" | "WARNING";
  code: string;
  message: string;
  nodeId?: string;
}

export interface PlaybookValidationResultDto {
  valid: boolean;
  issues: PlaybookValidationIssueDto[];
}

export interface PlaybookExecutionStepDto {
  id: string;
  nodeId: string;
  stepType: PlaybookStepType;
  status: PlaybookExecutionStepStatus;
  input: unknown;
  output: unknown;
  error: string | null;
  reconJobId: string | null;
  vulnScanJobId: string | null;
  adHocCommandId: string | null;
  approvalId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface PlaybookExecutionDto {
  id: string;
  workspaceId: string;
  projectId: string;
  playbookId: string;
  playbookVersionId: string;
  targetId: string;
  status: PlaybookExecutionStatus;
  isDryRun: boolean;
  variableValues: Record<string, unknown>;
  requestedBy: string;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  steps: PlaybookExecutionStepDto[];
}

export interface StartPlaybookExecutionRequestDto {
  targetId: string;
  variableValues?: Record<string, unknown>;
  isDryRun?: boolean;
}

/// Response shape specific to a dry run — spec section "PLAYBOOK TEST
/// MODE": planned steps, required permissions, required approvals,
/// target scope, tools involved, estimated execution. Distinct from
/// PlaybookExecutionDto so a client can't confuse a dry-run preview with
/// a real (state-changing) execution record.
export interface PlaybookDryRunResultDto {
  playbookId: string;
  playbookVersionId: string;
  targetId: string;
  plannedSteps: {
    nodeId: string;
    type: PlaybookStepType;
    label: string;
    toolsInvolved: string[];
    requiredPermissions: string[];
    requiresApproval: boolean;
  }[];
  targetScopeStatus: string;
  estimatedDurationSeconds: number;
}

export interface PlaybookApprovalDto {
  id: string;
  executionId: string;
  executionStepId: string;
  status: PlaybookApprovalStatus;
  securityApprovalRequestId: string | null;
  requestedBy: string;
  decidedBy: string | null;
  decidedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface DecidePlaybookApprovalRequestDto {
  approve: boolean;
  decisionNote?: string;
}
