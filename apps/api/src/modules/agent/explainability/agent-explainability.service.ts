import { Inject, Injectable } from '@nestjs/common';
import type {
  AgentTaskEvidenceDto,
  AgentTaskExplanationDto,
  OrchestrationExplanationDto,
} from '@pentesthub/shared';
import {
  AGENT_ORCHESTRATION_REPOSITORY,
  type AgentOrchestrationRepository,
  type AgentTaskRecord,
  type AgentToolCallLogRecord,
} from '../domain/repositories/agent-orchestration.repository.interface.js';

function summarizeToolCall(record: AgentToolCallLogRecord): AgentTaskEvidenceDto {
  if (record.errorMessage) {
    return { toolName: record.toolName, summary: `Failed: ${record.errorMessage}` };
  }
  const output = record.output;
  const message = output && typeof output.message === 'string' ? output.message : null;
  if (message) return { toolName: record.toolName, summary: message };

  const count = output && typeof output.count === 'number' ? output.count : null;
  if (count !== null) {
    return { toolName: record.toolName, summary: `Found ${count} result(s).` };
  }

  const raw = output ? JSON.stringify(output) : '(no output)';
  return {
    toolName: record.toolName,
    summary: raw.length > 160 ? `${raw.slice(0, 160)}...` : raw,
  };
}

/// Module 11 — Explainability layer (task #233). Pure aggregation/
/// presentation over data every AgentTask/AgentToolCallLog already
/// persists (reasoningSummary, confidenceScore, sources, and each tool
/// call's input/output) — deliberately not a new persisted concept or
/// schema addition. Explainability's spec goal is "show your work," and
/// every agent (PromptDrivenAgent.execute, task #224) and the
/// orchestrator (task #223/#226) already capture that work; this service
/// exists solely to reshape it into one coherent top-to-bottom narrative
/// (plan -> per-task reasoning + evidence -> overall result) instead of
/// leaving a caller to reconstruct that themselves from the raw task
/// tree, the way toOrchestrationRunDto's `tasks` array alone would
/// require.
@Injectable()
export class AgentExplainabilityService {
  constructor(
    @Inject(AGENT_ORCHESTRATION_REPOSITORY)
    private readonly repository: AgentOrchestrationRepository,
  ) {}

  async explainRun(orchestrationRunId: string): Promise<OrchestrationExplanationDto | null> {
    const run = await this.repository.findRunById(orchestrationRunId);
    if (!run) return null;

    const tasks = await this.repository.listTasksForRun(orchestrationRunId);
    // Module 11 — Performance optimizations (task #235): one batched query
    // instead of one listToolCallLogsForTask round-trip per task.
    const toolCallsByTaskId = await this.repository.listToolCallLogsForTasks(
      tasks.map((t) => t.id),
    );

    const byParent = new Map<string | null, AgentTaskRecord[]>();
    for (const task of tasks) {
      const list = byParent.get(task.parentTaskId) ?? [];
      list.push(task);
      byParent.set(task.parentTaskId, list);
    }

    const buildExplanation = (parentId: string | null): AgentTaskExplanationDto[] =>
      (byParent.get(parentId) ?? []).map((task) => ({
        taskId: task.id,
        agentType: task.agentType,
        title: task.title,
        status: task.status,
        reasoningSummary: task.reasoningSummary,
        confidenceScore: task.confidenceScore,
        sources: (task.sources as AgentTaskExplanationDto['sources']) ?? [],
        evidence: (toolCallsByTaskId.get(task.id) ?? []).map(summarizeToolCall),
        subTasks: buildExplanation(task.id),
      }));

    const plan = run.planJson as unknown as {
      reasoningSummary?: string;
      alternativesConsidered?: string[];
    } | null;

    return {
      orchestrationRunId: run.id,
      goal: run.goal,
      status: run.status,
      planReasoning: plan?.reasoningSummary ?? null,
      alternativesConsidered: plan?.alternativesConsidered ?? [],
      taskExplanations: buildExplanation(null),
      overallConfidence: run.confidenceScore,
      resultSummary: run.resultSummary,
    };
  }
}
