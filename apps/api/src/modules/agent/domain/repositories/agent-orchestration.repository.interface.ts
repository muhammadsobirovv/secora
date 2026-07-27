import type { AgentTaskStatus, AgentType, OrchestrationRunStatus } from '@pentesthub/shared';

export interface OrchestrationRunRecord {
  id: string;
  workspaceId: string;
  projectId: string | null;
  userId: string;
  goal: string;
  status: OrchestrationRunStatus;
  planJson: Record<string, unknown> | null;
  resultSummary: string | null;
  confidenceScore: number | null;
  errorMessage: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOrchestrationRunInput {
  workspaceId: string;
  projectId: string | null;
  userId: string;
  goal: string;
}

export interface UpdateOrchestrationRunInput {
  status?: OrchestrationRunStatus;
  planJson?: Record<string, unknown> | null;
  resultSummary?: string | null;
  confidenceScore?: number | null;
  errorMessage?: string | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
}

export interface ListOrchestrationRunsFilter {
  workspaceId: string;
  projectId?: string;
  status?: OrchestrationRunStatus;
  limit?: number;
}

export interface AgentTaskRecord {
  id: string;
  orchestrationRunId: string;
  parentTaskId: string | null;
  agentType: AgentType;
  title: string;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  status: AgentTaskStatus;
  reasoningSummary: string | null;
  confidenceScore: number | null;
  sources: unknown[] | null;
  errorMessage: string | null;
  retryCount: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAgentTaskInput {
  orchestrationRunId: string;
  parentTaskId: string | null;
  agentType: AgentType;
  title: string;
  input: Record<string, unknown> | null;
}

export interface UpdateAgentTaskInput {
  status?: AgentTaskStatus;
  output?: Record<string, unknown> | null;
  reasoningSummary?: string | null;
  confidenceScore?: number | null;
  sources?: unknown[] | null;
  errorMessage?: string | null;
  retryCount?: number;
  startedAt?: Date | null;
  finishedAt?: Date | null;
}

export interface AgentToolCallLogRecord {
  id: string;
  agentTaskId: string;
  toolName: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: Date;
}

export interface CreateAgentToolCallLogInput {
  agentTaskId: string;
  toolName: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  errorMessage: string | null;
  durationMs: number | null;
}

/// Module 11's one raw-SQL persistence boundary for the whole
/// orchestration domain — mirrors PrismaAiMemoryRepository's reasoning
/// (see that file's doc comment), except here it's the *entire* table set
/// (OrchestrationRun/AgentTask/AgentToolCallLog), not one column: these
/// tables were added via a hand-applied migration
/// (20260601000000_ai_multi_agent_system), not `prisma generate`, so the
/// generated Prisma Client has no typed model for any of them yet. A real
/// dev environment running `prisma generate` normally would let a future
/// pass replace this with typed Client calls as a pure enhancement — see
/// docs/adr/0011-ai-security-copilot-multi-agent-system.md.
export interface AgentOrchestrationRepository {
  createRun(input: CreateOrchestrationRunInput): Promise<OrchestrationRunRecord>;
  findRunById(id: string): Promise<OrchestrationRunRecord | null>;
  listRuns(filter: ListOrchestrationRunsFilter): Promise<OrchestrationRunRecord[]>;
  updateRun(id: string, data: UpdateOrchestrationRunInput): Promise<OrchestrationRunRecord>;

  createTask(input: CreateAgentTaskInput): Promise<AgentTaskRecord>;
  findTaskById(id: string): Promise<AgentTaskRecord | null>;
  listTasksForRun(orchestrationRunId: string): Promise<AgentTaskRecord[]>;
  listSubTasks(parentTaskId: string): Promise<AgentTaskRecord[]>;
  updateTask(id: string, data: UpdateAgentTaskInput): Promise<AgentTaskRecord>;

  createToolCallLog(
    input: CreateAgentToolCallLogInput,
  ): Promise<AgentToolCallLogRecord>;
  listToolCallLogsForTask(agentTaskId: string): Promise<AgentToolCallLogRecord[]>;
  /// Module 11 — Performance optimizations (task #235). Batched variant of
  /// listToolCallLogsForTask: both AgentOrchestratorService.toolCallsByTaskId
  /// and AgentExplainabilityService.explainRun were issuing one query per
  /// task (via Promise.all over listToolCallLogsForTask) — this replaces
  /// that N-query fan-out with a single `WHERE "agentTaskId" IN (...)`
  /// round-trip, grouped by task ID for the caller.
  listToolCallLogsForTasks(
    agentTaskIds: string[],
  ): Promise<Map<string, AgentToolCallLogRecord[]>>;
}

export const AGENT_ORCHESTRATION_REPOSITORY = Symbol(
  'AGENT_ORCHESTRATION_REPOSITORY',
);
