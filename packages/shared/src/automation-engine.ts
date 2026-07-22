// Module 10 — Automation Engine (visual workflow builder). Types for the
// `Workflow`/`WorkflowRun`/`WorkflowStepLog` Prisma models and the
// `definitionJson` step-graph shape those models' doc comments describe.
// Interpreted server-side by
// apps/api/src/modules/automation-engine/services/workflow-executor.service.ts.

export const WORKFLOW_STEP_KINDS = [
  "recon",
  "scan",
  "report",
  "notify",
  "ai_analysis",
  "create_ticket",
  "sync_data",
  "condition",
  "loop",
  "delay",
] as const;
export type WorkflowStepKind = (typeof WORKFLOW_STEP_KINDS)[number];

export const WORKFLOW_CONDITION_OPERATORS = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
  "exists",
] as const;
export type WorkflowConditionOperator = (typeof WORKFLOW_CONDITION_OPERATORS)[number];

/// A single node in the step graph. `next` points at the key of the step
/// to run afterward (or null to end the run); `condition` steps ignore
/// `next` and use `whenTrue`/`whenFalse` instead. `params` is
/// kind-specific — see each kind's comment below and
/// workflow-definition.schema.ts's Zod shape (the source of truth for
/// validation; this file is the type-level mirror of that schema).
export interface WorkflowStepDefinition {
  key: string;
  kind: WorkflowStepKind;
  /// Params, by kind:
  /// - recon: { targetId?: string; tool?: string }
  /// - scan: { targetId?: string; scanner?: string }
  /// - report: { type: "bug_report" | "enterprise"; workspaceId?: string; organizationId?: string; title?: string }
  /// - notify: { userId: string; title: string; body?: string }
  /// - ai_analysis: { prompt: string; maxTokens?: number }
  /// - create_ticket / sync_data: { organizationId: string; connectionId: string; action: string; payload?: Record<string, unknown> }
  /// - condition: { field: string; operator: WorkflowConditionOperator; value?: unknown; whenTrue: string | null; whenFalse: string | null }
  /// - loop: { itemsField: string; steps: WorkflowStepDefinition[] }
  /// - delay: { minutes: number }
  params: Record<string, unknown>;
  next?: string | null;
  onFailure?: string | null;
}

export interface WorkflowDefinition {
  startAt: string;
  steps: WorkflowStepDefinition[];
}

export type WorkflowTriggerType = "MANUAL" | "SCHEDULE" | "EVENT" | "WEBHOOK";
export type WorkflowRunStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";

export interface WorkflowDto {
  id: string;
  organizationId: string | null;
  workspaceId: string | null;
  name: string;
  description: string | null;
  definition: WorkflowDefinition;
  triggerType: WorkflowTriggerType;
  cronExpression: string | null;
  nextRunAt: string | null;
  enabled: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkflowRequestDto {
  workspaceId?: string;
  name: string;
  description?: string;
  definition: WorkflowDefinition;
  triggerType: WorkflowTriggerType;
  cronExpression?: string;
  enabled?: boolean;
}

export type UpdateWorkflowRequestDto = Partial<
  Omit<CreateWorkflowRequestDto, "workspaceId">
>;

export interface WorkflowStepLogDto {
  id: string;
  workflowRunId: string;
  stepKey: string;
  status: string;
  message: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface WorkflowRunDto {
  id: string;
  workflowId: string;
  status: WorkflowRunStatus;
  triggeredBy: string | null;
  input: unknown;
  output: unknown;
  error: string | null;
  pausedAtStepKey: string | null;
  resumeAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  steps?: WorkflowStepLogDto[];
}

export interface TriggerWorkflowRequestDto {
  input?: Record<string, unknown>;
}

export interface ListWorkflowRunsQueryDto {
  status?: WorkflowRunStatus;
  limit?: number;
}
