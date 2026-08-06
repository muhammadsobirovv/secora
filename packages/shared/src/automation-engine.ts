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
  // Module 11 — AI Workflow Automation (task #232): starts a Master AI
  // Orchestrator run (agent decomposition + multi-agent execution),
  // distinct from `ai_analysis` — that kind is one single-shot AI text
  // completion, this kind is a whole autonomous, potentially long-running
  // multi-step agent operation. params: { goal: string; projectId?:
  // string; provider?: string; model?: string }.
  "ai_agent_run",
  // Module 13 — Workflow Builder block set (task #283). params below.
  // - parallel: { branches: WorkflowStepDefinition[][] } — each inner
  //   array is one branch's own step chain, run concurrently
  //   (Promise.all-style); the parallel step itself completes once every
  //   branch's chain reaches a step with `next: null`.
  "parallel",
  // - approval: { approverUserId?: string; approverRole?: string; message?: string }
  //   pauses the run (same pause/resume machinery `delay` already uses —
  //   WorkflowRun.pausedAtStepKey/resumeAt is left null; a new
  //   `pendingApproval` boolean marks it instead) until a human approves
  //   or rejects via WorkflowRunsController's approve/reject endpoint.
  "approval",
  // - export: { format: "json" | "csv" | "markdown"; sourceField: string }
  //   serializes an earlier step's output (via the same contextJson
  //   template lookup `resolveTemplate` already does) into the run's
  //   output, ready for download.
  "export",
  // - webhook_call: { url: string; method?: "GET"|"POST"|"PUT"; headers?: Record<string,string>; bodyField?: string }
  //   an OUTBOUND HTTP call mid-workflow — distinct from the workflow's
  //   own `triggerType: "WEBHOOK"` (an INBOUND trigger, see
  //   `WorkflowWebhookTriggerDto` below).
  "webhook_call",
  // - set_variable: { name: string; valueField?: string; value?: unknown }
  //   writes into WorkflowRun.contextJson under `variables.<name>` so
  //   later steps can reference it via the same `{{steps.x.y}}`-style
  //   template syntax, extended to `{{variables.name}}`.
  "set_variable",
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
  /// Module 13 (task #283): trigger metadata that isn't step-graph shaped,
  /// kept alongside it in the same JSON column rather than a schema
  /// migration on `Workflow` — `eventKey` is only meaningful when
  /// `Workflow.triggerType === "EVENT"` (matched against the Event Bus's
  /// event-key catalog, e.g. `"finding.created"` — see
  /// `mcp/events/mcp-domain-events.ts`'s `toWebhookEventKey`-style keys);
  /// a `WEBHOOK` trigger's inbound token lives in
  /// `WorkflowWebhookTrigger` instead (a secret, so kept out of the
  /// definition a user's browser fetches to render the visual builder).
  trigger?: {
    eventKey?: string;
  };
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

// ---- Module 13 additions (task #283) ----

/// The inbound counterpart of `triggerType: "WEBHOOK"` — a bearer token
/// minted for one Workflow; `POST /public/workflow-triggers/{token}`
/// starts a run with the request body as `input`. Deliberately its own
/// small table (`workflow_webhook_triggers`, raw-SQL only — see
/// docs/adr/0013-ai-automation-platform-mcp-ecosystem.md) rather than a
/// `Workflow` column, so the secret token never round-trips through the
/// visual builder's "fetch this workflow's definition to render it" call.
export interface WorkflowWebhookTriggerDto {
  workflowId: string;
  token: string;
  url: string;
  createdAt: string;
}

export interface ApproveWorkflowStepRequestDto {
  approved: boolean;
  note?: string;
}
