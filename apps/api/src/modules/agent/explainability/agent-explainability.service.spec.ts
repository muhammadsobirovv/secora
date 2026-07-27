import { describe, expect, it, jest } from '@jest/globals';
import type {
  AgentOrchestrationRepository,
  AgentTaskRecord,
  AgentToolCallLogRecord,
  OrchestrationRunRecord,
} from '../domain/repositories/agent-orchestration.repository.interface.js';
import { AgentExplainabilityService } from './agent-explainability.service.js';

/// Module 11 — Explainability layer (task #233) unit tests. This service
/// is pure aggregation/reshaping over data AgentTask/AgentToolCallLog
/// already persist — these tests pin down the reshaping logic itself:
/// tree reconstruction from flat parentTaskId rows, per-tool-call evidence
/// summarization (task #233's `summarizeToolCall`), and the null-run /
/// empty-plan edge cases.
function run(overrides: Partial<OrchestrationRunRecord> = {}): OrchestrationRunRecord {
  return {
    id: 'run-1',
    workspaceId: 'ws-1',
    projectId: null,
    userId: 'user-1',
    goal: 'Recon and triage api.example.com',
    status: 'COMPLETED',
    planJson: null,
    resultSummary: 'Found 3 findings, 1 critical.',
    confidenceScore: 0.82,
    errorMessage: null,
    startedAt: new Date(),
    finishedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function task(overrides: Partial<AgentTaskRecord> = {}): AgentTaskRecord {
  return {
    id: 'task-1',
    orchestrationRunId: 'run-1',
    parentTaskId: null,
    agentType: 'RECON',
    title: 'Enumerate subdomains',
    input: null,
    output: null,
    status: 'COMPLETED',
    reasoningSummary: 'Ran subfinder against the root domain.',
    confidenceScore: 0.9,
    sources: null,
    errorMessage: null,
    retryCount: 0,
    startedAt: new Date(),
    finishedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function toolCall(overrides: Partial<AgentToolCallLogRecord> = {}): AgentToolCallLogRecord {
  return {
    id: 'tc-1',
    agentTaskId: 'task-1',
    toolName: 'subfinder',
    input: {},
    output: null,
    errorMessage: null,
    durationMs: 1200,
    createdAt: new Date(),
    ...overrides,
  };
}

function buildService() {
  const repository = {
    findRunById: jest.fn<AgentOrchestrationRepository['findRunById']>(),
    listTasksForRun: jest.fn<AgentOrchestrationRepository['listTasksForRun']>(),
    listToolCallLogsForTasks: jest.fn<AgentOrchestrationRepository['listToolCallLogsForTasks']>(),
  } as unknown as jest.Mocked<AgentOrchestrationRepository>;
  const service = new AgentExplainabilityService(repository);
  return { service, repository };
}

describe('AgentExplainabilityService.explainRun', () => {
  it('returns null when the run does not exist', async () => {
    const { service, repository } = buildService();
    repository.findRunById.mockResolvedValue(null);

    const result = await service.explainRun('missing-run');

    expect(result).toBeNull();
  });

  it('reconstructs a nested task tree from flat parentTaskId rows', async () => {
    const { service, repository } = buildService();
    repository.findRunById.mockResolvedValue(run());
    repository.listTasksForRun.mockResolvedValue([
      task({ id: 'task-1', parentTaskId: null, title: 'Enumerate subdomains' }),
      task({ id: 'task-2', parentTaskId: 'task-1', title: 'Screenshot live hosts', agentType: 'WEB' }),
      task({ id: 'task-3', parentTaskId: 'task-1', title: 'Port scan', agentType: 'CLOUD' }),
    ]);
    repository.listToolCallLogsForTasks.mockResolvedValue(new Map());

    const result = await service.explainRun('run-1');

    expect(result).not.toBeNull();
    expect(result!.taskExplanations).toHaveLength(1);
    expect(result!.taskExplanations[0].taskId).toBe('task-1');
    expect(result!.taskExplanations[0].subTasks).toHaveLength(2);
    expect(result!.taskExplanations[0].subTasks.map((t) => t.taskId).sort()).toEqual(['task-2', 'task-3']);
  });

  it('batches tool call logs by task id via listToolCallLogsForTasks (task #235)', async () => {
    const { service, repository } = buildService();
    repository.findRunById.mockResolvedValue(run());
    repository.listTasksForRun.mockResolvedValue([task({ id: 'task-1' })]);
    repository.listToolCallLogsForTasks.mockResolvedValue(new Map());

    await service.explainRun('run-1');

    expect(repository.listToolCallLogsForTasks).toHaveBeenCalledWith(['task-1']);
    expect(repository.listToolCallLogsForTasks).toHaveBeenCalledTimes(1);
  });

  describe('evidence summarization (summarizeToolCall)', () => {
    it('summarizes a failed tool call as "Failed: <errorMessage>"', async () => {
      const { service, repository } = buildService();
      repository.findRunById.mockResolvedValue(run());
      repository.listTasksForRun.mockResolvedValue([task({ id: 'task-1' })]);
      repository.listToolCallLogsForTasks.mockResolvedValue(
        new Map([['task-1', [toolCall({ errorMessage: 'connection refused', output: null })]]]),
      );

      const result = await service.explainRun('run-1');

      expect(result!.taskExplanations[0].evidence[0]).toEqual({
        toolName: 'subfinder',
        summary: 'Failed: connection refused',
      });
    });

    it('prefers output.message when present', async () => {
      const { service, repository } = buildService();
      repository.findRunById.mockResolvedValue(run());
      repository.listTasksForRun.mockResolvedValue([task({ id: 'task-1' })]);
      repository.listToolCallLogsForTasks.mockResolvedValue(
        new Map([['task-1', [toolCall({ output: { message: 'Resolved 12 subdomains.' } })]]]),
      );

      const result = await service.explainRun('run-1');

      expect(result!.taskExplanations[0].evidence[0].summary).toBe('Resolved 12 subdomains.');
    });

    it('falls back to "Found N result(s)." when output.count is present but no message', async () => {
      const { service, repository } = buildService();
      repository.findRunById.mockResolvedValue(run());
      repository.listTasksForRun.mockResolvedValue([task({ id: 'task-1' })]);
      repository.listToolCallLogsForTasks.mockResolvedValue(
        new Map([['task-1', [toolCall({ output: { count: 7 } })]]]),
      );

      const result = await service.explainRun('run-1');

      expect(result!.taskExplanations[0].evidence[0].summary).toBe('Found 7 result(s).');
    });

    it('truncates a raw JSON fallback beyond 160 characters', async () => {
      const { service, repository } = buildService();
      repository.findRunById.mockResolvedValue(run());
      repository.listTasksForRun.mockResolvedValue([task({ id: 'task-1' })]);
      const bigOutput = { data: 'x'.repeat(200) };
      repository.listToolCallLogsForTasks.mockResolvedValue(
        new Map([['task-1', [toolCall({ output: bigOutput })]]]),
      );

      const result = await service.explainRun('run-1');

      const summary = result!.taskExplanations[0].evidence[0].summary;
      expect(summary.endsWith('...')).toBe(true);
      expect(summary.length).toBe(163); // 160 chars + "..."
    });

    it('reports "(no output)" when a tool call has neither error nor output', async () => {
      const { service, repository } = buildService();
      repository.findRunById.mockResolvedValue(run());
      repository.listTasksForRun.mockResolvedValue([task({ id: 'task-1' })]);
      repository.listToolCallLogsForTasks.mockResolvedValue(
        new Map([['task-1', [toolCall({ output: null, errorMessage: null })]]]),
      );

      const result = await service.explainRun('run-1');

      expect(result!.taskExplanations[0].evidence[0].summary).toBe('(no output)');
    });
  });

  describe('plan reasoning extraction', () => {
    it('pulls reasoningSummary/alternativesConsidered out of planJson when present', async () => {
      const { service, repository } = buildService();
      repository.findRunById.mockResolvedValue(
        run({
          planJson: {
            reasoningSummary: 'Decomposed into recon then vuln analysis.',
            alternativesConsidered: ['Skip recon and scan directly'],
          },
        }),
      );
      repository.listTasksForRun.mockResolvedValue([]);
      repository.listToolCallLogsForTasks.mockResolvedValue(new Map());

      const result = await service.explainRun('run-1');

      expect(result!.planReasoning).toBe('Decomposed into recon then vuln analysis.');
      expect(result!.alternativesConsidered).toEqual(['Skip recon and scan directly']);
    });

    it('defaults planReasoning to null and alternativesConsidered to [] when planJson is null', async () => {
      const { service, repository } = buildService();
      repository.findRunById.mockResolvedValue(run({ planJson: null }));
      repository.listTasksForRun.mockResolvedValue([]);
      repository.listToolCallLogsForTasks.mockResolvedValue(new Map());

      const result = await service.explainRun('run-1');

      expect(result!.planReasoning).toBeNull();
      expect(result!.alternativesConsidered).toEqual([]);
    });
  });

  it('carries the run-level overallConfidence and resultSummary through unchanged', async () => {
    const { service, repository } = buildService();
    repository.findRunById.mockResolvedValue(run({ confidenceScore: 0.75, resultSummary: 'All clear.' }));
    repository.listTasksForRun.mockResolvedValue([]);
    repository.listToolCallLogsForTasks.mockResolvedValue(new Map());

    const result = await service.explainRun('run-1');

    expect(result!.overallConfidence).toBe(0.75);
    expect(result!.resultSummary).toBe('All clear.');
  });
});
