// Module 11 — AI Security Copilot + Autonomous Multi-Agent System.
// Mirrors the shape/conventions of ai.ts (Module 5); see
// docs/adr/0011-ai-security-copilot-multi-agent-system.md.
//
// Domain split: this file covers the orchestrator/agent bookkeeping
// (OrchestrationRun -> AgentTask -> AgentToolCallLog). Knowledge Base
// reference entries and Prompt Templates are separate domains — see
// knowledge-base-reference.ts and prompt-template.ts — since they have
// their own lifecycle independent of any particular orchestration run.

/// The twelve specialist agents the Master AI Orchestrator can delegate to.
/// Mirrors the AgentType enum in schema.prisma one-for-one.
export const AGENT_TYPES = [
  "RECON",
  "WEB",
  "API",
  "MOBILE",
  "CLOUD",
  "ACTIVE_DIRECTORY",
  "AI_RESEARCH",
  "EXPLOIT_ANALYSIS",
  "REPORT_WRITER",
  "CODE_REVIEW",
  "RISK_ASSESSMENT",
  "WORKFLOW_COORDINATOR",
] as const;

export type AgentType = (typeof AGENT_TYPES)[number];

export type OrchestrationRunStatus =
  | "PENDING"
  | "PLANNING"
  | "RUNNING"
  | "PAUSED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type AgentTaskStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED" | "RETRYING";

/// A single tool invocation an agent made while working an AgentTask —
/// the multi-agent-system analogue of AiToolCallLogDto in ai.ts.
export interface AgentToolCallLogDto {
  id: string;
  agentTaskId: string;
  toolName: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: string;
}

/// One unit of work assigned to a specialist agent. `parentTaskId` set means
/// this task was delegated by another task (Task Delegation); `sources` is
/// Explainability's "referenced findings / referenced evidence" list, kept
/// generic (`{type, id, label}[]`) so any entity kind can be cited.
export interface AgentTaskDto {
  id: string;
  orchestrationRunId: string;
  parentTaskId: string | null;
  agentType: AgentType;
  title: string;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  status: AgentTaskStatus;
  /// Explainability — a short human-readable "why" for this task's result.
  reasoningSummary: string | null;
  /// Explainability — 0..1 self-reported confidence.
  confidenceScore: number | null;
  sources: AgentTaskSourceRef[] | null;
  errorMessage: string | null;
  retryCount: number;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  toolCalls: AgentToolCallLogDto[];
  subTasks: AgentTaskDto[];
}

export interface AgentTaskSourceRef {
  type: "FINDING" | "RECON_FINDING" | "EVIDENCE" | "NOTE" | "REPORT" | "KNOWLEDGE_BASE_REFERENCE" | "AGENT_TASK";
  id: string;
  label: string;
}

/// A Master AI Orchestrator run — one user goal, decomposed into a tree of
/// AgentTasks. `planJson` holds the orchestrator's task-decomposition plan
/// (Reasoning Engine's Planning output) so it can be inspected/replayed.
export interface OrchestrationRunDto {
  id: string;
  workspaceId: string;
  projectId: string | null;
  userId: string;
  goal: string;
  status: OrchestrationRunStatus;
  planJson: OrchestrationPlanDto | null;
  resultSummary: string | null;
  confidenceScore: number | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  tasks: AgentTaskDto[];
}

/// A lighter-weight list-view row (no nested tasks) for GET /agent/runs.
export interface OrchestrationRunSummaryDto {
  id: string;
  workspaceId: string;
  projectId: string | null;
  userId: string;
  goal: string;
  status: OrchestrationRunStatus;
  confidenceScore: number | null;
  taskCount: number;
  completedTaskCount: number;
  failedTaskCount: number;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/// The Reasoning Engine's task-decomposition output — the orchestrator's
/// plan before/while it assigns agents. Steps map 1:1 to AgentTasks once
/// execution starts, but exist here first as intent (Planning + Task
/// Decomposition + Alternative Solution Generation).
export interface OrchestrationPlanDto {
  steps: OrchestrationPlanStepDto[];
  alternativesConsidered?: string[];
  reasoningSummary?: string;
}

export interface OrchestrationPlanStepDto {
  agentType: AgentType;
  title: string;
  dependsOnStepIndexes: number[];
  input?: Record<string, unknown>;
}

export interface CreateOrchestrationRunRequestDto {
  projectId?: string;
  goal: string;
}

export interface ListOrchestrationRunsQueryDto {
  projectId?: string;
  status?: OrchestrationRunStatus;
  limit?: number;
}

/// Module 11 — Explainability layer (task #233). A presentation-layer
/// aggregation over data every AgentTask already persists
/// (reasoningSummary/confidenceScore/sources) plus its tool-call log,
/// reshaped into a "why did the system conclude this" narrative a human
/// (or the frontend's Copilot UI) can read top-to-bottom without having
/// to reconstruct it from the raw task tree + planJson itself. Nothing
/// here is new data — see AgentExplainabilityService's doc comment for
/// why this is pure aggregation, not a new persisted concept.
export interface AgentTaskEvidenceDto {
  toolName: string;
  /// A short one-line description of what the tool call found/did —
  /// derived from its output, never the raw (potentially large) JSON.
  summary: string;
}

export interface AgentTaskExplanationDto {
  taskId: string;
  agentType: AgentType;
  title: string;
  status: AgentTaskStatus;
  reasoningSummary: string | null;
  confidenceScore: number | null;
  sources: AgentTaskSourceRef[];
  evidence: AgentTaskEvidenceDto[];
  subTasks: AgentTaskExplanationDto[];
}

export interface OrchestrationExplanationDto {
  orchestrationRunId: string;
  goal: string;
  status: OrchestrationRunStatus;
  /// The Reasoning Engine's own top-level plan narrative (Planning +
  /// Task Decomposition + Alternative Solution Generation) — null until
  /// planning has completed.
  planReasoning: string | null;
  alternativesConsidered: string[];
  taskExplanations: AgentTaskExplanationDto[];
  /// The run's final self-reported/self-evaluated confidence (task
  /// #226's Reasoning Engine self-evaluation may have already revised
  /// this away from the simple per-task average).
  overallConfidence: number | null;
  /// Includes the Reasoning Engine's self-evaluation critique and
  /// recommended follow-ups appended under headings, when present — see
  /// AgentOrchestratorService.execute's self-evaluation step.
  resultSummary: string | null;
}

/// One event on an orchestration run's live SSE stream — mirrors
/// AiChatMessageStreamEvent's discriminated-union shape in ai.ts, but for
/// "the orchestrator is working" instead of "the assistant is typing".
export type OrchestrationStreamEvent =
  | { type: "plan"; plan: OrchestrationPlanDto }
  | { type: "task_started"; task: AgentTaskDto }
  | { type: "task_progress"; taskId: string; reasoningSummary: string }
  | { type: "task_tool_call"; taskId: string; toolName: string; input: Record<string, unknown> }
  | { type: "task_tool_result"; taskId: string; toolName: string; output: Record<string, unknown> }
  | { type: "task_completed"; task: AgentTaskDto }
  | { type: "task_failed"; task: AgentTaskDto }
  | { type: "run_completed"; run: OrchestrationRunDto }
  | { type: "run_failed"; message: string }
  | { type: "cancelled" };
