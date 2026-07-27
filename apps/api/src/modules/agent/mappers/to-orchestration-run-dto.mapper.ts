import type {
  AgentTaskDto,
  AgentToolCallLogDto,
  OrchestrationPlanDto,
  OrchestrationRunDto,
  OrchestrationRunSummaryDto,
} from '@pentesthub/shared';
import type {
  AgentTaskRecord,
  AgentToolCallLogRecord,
  OrchestrationRunRecord,
} from '../domain/repositories/agent-orchestration.repository.interface.js';

export function toAgentToolCallLogDto(
  record: AgentToolCallLogRecord,
): AgentToolCallLogDto {
  return {
    id: record.id,
    agentTaskId: record.agentTaskId,
    toolName: record.toolName,
    input: record.input,
    output: record.output,
    errorMessage: record.errorMessage,
    durationMs: record.durationMs,
    createdAt: record.createdAt.toISOString(),
  };
}

export function toAgentTaskDto(
  record: AgentTaskRecord,
  toolCalls: AgentToolCallLogRecord[] = [],
  subTasks: AgentTaskDto[] = [],
): AgentTaskDto {
  return {
    id: record.id,
    orchestrationRunId: record.orchestrationRunId,
    parentTaskId: record.parentTaskId,
    agentType: record.agentType,
    title: record.title,
    input: record.input,
    output: record.output,
    status: record.status,
    reasoningSummary: record.reasoningSummary,
    confidenceScore: record.confidenceScore,
    sources: (record.sources as AgentTaskDto['sources']) ?? null,
    errorMessage: record.errorMessage,
    retryCount: record.retryCount,
    startedAt: record.startedAt ? record.startedAt.toISOString() : null,
    finishedAt: record.finishedAt ? record.finishedAt.toISOString() : null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    toolCalls: toolCalls.map(toAgentToolCallLogDto),
    subTasks,
  };
}

export function toOrchestrationRunDto(
  record: OrchestrationRunRecord,
  tasks: AgentTaskDto[] = [],
): OrchestrationRunDto {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    projectId: record.projectId,
    userId: record.userId,
    goal: record.goal,
    status: record.status,
    planJson: (record.planJson as unknown as OrchestrationPlanDto) ?? null,
    resultSummary: record.resultSummary,
    confidenceScore: record.confidenceScore,
    errorMessage: record.errorMessage,
    startedAt: record.startedAt ? record.startedAt.toISOString() : null,
    finishedAt: record.finishedAt ? record.finishedAt.toISOString() : null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    tasks,
  };
}

export function toOrchestrationRunSummaryDto(
  record: OrchestrationRunRecord,
  tasks: AgentTaskRecord[],
): OrchestrationRunSummaryDto {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    projectId: record.projectId,
    userId: record.userId,
    goal: record.goal,
    status: record.status,
    confidenceScore: record.confidenceScore,
    taskCount: tasks.length,
    completedTaskCount: tasks.filter((t) => t.status === 'COMPLETED').length,
    failedTaskCount: tasks.filter((t) => t.status === 'FAILED').length,
    startedAt: record.startedAt ? record.startedAt.toISOString() : null,
    finishedAt: record.finishedAt ? record.finishedAt.toISOString() : null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/// Nests each task's own subTasks under it (Task Delegation tree) rather
/// than leaving the caller with one flat list — `records` should already
/// be every task for the run, in any order.
export function buildTaskTree(
  records: AgentTaskRecord[],
  toolCallsByTaskId: Map<string, AgentToolCallLogRecord[]>,
): AgentTaskDto[] {
  const byParent = new Map<string | null, AgentTaskRecord[]>();
  for (const record of records) {
    const key = record.parentTaskId;
    const list = byParent.get(key) ?? [];
    list.push(record);
    byParent.set(key, list);
  }

  function build(parentId: string | null): AgentTaskDto[] {
    const children = byParent.get(parentId) ?? [];
    return children.map((record) =>
      toAgentTaskDto(
        record,
        toolCallsByTaskId.get(record.id) ?? [],
        build(record.id),
      ),
    );
  }

  return build(null);
}
