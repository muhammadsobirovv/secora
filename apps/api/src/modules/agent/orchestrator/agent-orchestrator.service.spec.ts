import { describe, expect, it, jest } from '@jest/globals';
import type {
  AgentOrchestrationRepository,
  AgentTaskRecord,
  OrchestrationRunRecord,
} from '../domain/repositories/agent-orchestration.repository.interface.js';
import { AgentOrchestratorService } from './agent-orchestrator.service.js';
import { AgentOrchestrationStreamHubService } from './agent-orchestration-stream-hub.service.js';

/// Module 11 — Master AI Orchestrator (task #223) + Performance
/// optimizations (task #235) unit tests. AgentOrchestratorService's
/// `execute`/`runTaskGraph`/`runOneTask` pipeline needs a live AI provider
/// and all twelve specialist agents to exercise end-to-end, so these tests
/// instead pin down the parts that are pure or independently testable
/// without that: mergeOutputs' result-summary/confidence aggregation
/// (private but plain/synchronous — accessed via a typed cast, a common
/// pattern for testing a class's internal pure logic without changing its
/// public API), cancel()'s delegation to the stream hub, retry()'s
/// task-reset logic, getRun()'s null-handling, and toTaskDto's
/// skipChildren fast path (task #235: the task_started stream event must
/// not issue the two extra DB round-trips a freshly-created task can't
/// possibly have data for yet).
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
    reasoningSummary: 'Ran subfinder.',
    confidenceScore: 0.8,
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

function run(overrides: Partial<OrchestrationRunRecord> = {}): OrchestrationRunRecord {
  return {
    id: 'run-1',
    workspaceId: 'ws-1',
    projectId: null,
    userId: 'user-1',
    goal: 'Recon api.example.com',
    status: 'RUNNING',
    planJson: null,
    resultSummary: null,
    confidenceScore: null,
    errorMessage: null,
    startedAt: new Date(),
    finishedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildService() {
  const repository = {
    createRun: jest.fn(),
    findRunById: jest.fn<AgentOrchestrationRepository['findRunById']>(),
    listRuns: jest.fn(),
    updateRun: jest.fn<AgentOrchestrationRepository['updateRun']>(),
    createTask: jest.fn(),
    findTaskById: jest.fn(),
    listTasksForRun: jest.fn<AgentOrchestrationRepository['listTasksForRun']>(),
    listSubTasks: jest.fn<AgentOrchestrationRepository['listSubTasks']>(),
    updateTask: jest.fn<AgentOrchestrationRepository['updateTask']>(),
    createToolCallLog: jest.fn(),
    listToolCallLogsForTask: jest.fn<AgentOrchestrationRepository['listToolCallLogsForTask']>(),
    listToolCallLogsForTasks: jest.fn<AgentOrchestrationRepository['listToolCallLogsForTasks']>(),
  } as unknown as jest.Mocked<AgentOrchestrationRepository>;

  const agentRegistry = { get: jest.fn() };
  const providerRegistry = { resolveProvider: jest.fn() };
  const memoryService = { indexContent: jest.fn(() => Promise.resolve()) };
  const reasoningEngine = { selfEvaluate: jest.fn() };
  const streamHub = new AgentOrchestrationStreamHubService();
  const configService = {
    get: jest.fn((key: string) => {
      const defaults: Record<string, unknown> = {
        AI_ORCHESTRATOR_MAX_TASK_RETRIES: 2,
        AI_ORCHESTRATOR_MAX_CONCURRENT_TASKS: 3,
        AI_ORCHESTRATOR_MAX_TASK_DEPTH: 3,
        AI_ORCHESTRATOR_TASK_TIMEOUT_MS: 60_000,
      };
      return defaults[key];
    }),
  };
  const eventBus = { publish: jest.fn() };

  const service = new AgentOrchestratorService(
    repository,
    agentRegistry as never,
    providerRegistry as never,
    memoryService as never,
    reasoningEngine as never,
    streamHub,
    configService as never,
    eventBus as never,
  );

  return { service, repository, streamHub, eventBus };
}

describe('AgentOrchestratorService', () => {
  describe('cancel', () => {
    it('delegates to the stream hub and returns true for an active run', () => {
      const { service, streamHub } = buildService();
      streamHub.start('run-1');

      expect(service.cancel('run-1')).toBe(true);
    });

    it('returns false for a run with no active stream', () => {
      const { service } = buildService();
      expect(service.cancel('run-unknown')).toBe(false);
    });
  });

  describe('getRun', () => {
    it('returns null when the run does not exist', async () => {
      const { service, repository } = buildService();
      repository.findRunById.mockResolvedValue(null);

      const result = await service.getRun('missing');

      expect(result).toBeNull();
    });

    it('builds a full DTO with a nested task tree when the run exists', async () => {
      const { service, repository } = buildService();
      repository.findRunById.mockResolvedValue(run());
      repository.listTasksForRun.mockResolvedValue([
        task({ id: 'task-1', parentTaskId: null }),
        task({ id: 'task-2', parentTaskId: 'task-1', title: 'Screenshot hosts' }),
      ]);
      repository.listToolCallLogsForTasks.mockResolvedValue(new Map());

      const result = await service.getRun('run-1');

      expect(result).not.toBeNull();
      expect(result!.tasks).toHaveLength(1);
      expect(result!.tasks[0].subTasks).toHaveLength(1);
      expect(result!.tasks[0].subTasks[0].id).toBe('task-2');
    });
  });

  describe('retry', () => {
    it('returns the current run state unchanged when the run is not FAILED', async () => {
      const { service, repository } = buildService();
      repository.findRunById.mockResolvedValue(run({ status: 'COMPLETED' }));
      repository.listTasksForRun.mockResolvedValue([]);
      repository.listToolCallLogsForTasks.mockResolvedValue(new Map());

      await service.retry('run-1');

      expect(repository.updateTask).not.toHaveBeenCalled();
      expect(repository.updateRun).not.toHaveBeenCalled();
    });

    it('resets failed tasks under the retry limit to QUEUED and increments retryCount', async () => {
      const { service, repository } = buildService();
      repository.findRunById.mockResolvedValue(run({ status: 'FAILED' }));
      repository.listTasksForRun.mockResolvedValue([
        task({ id: 'task-1', status: 'FAILED', retryCount: 0 }),
        task({ id: 'task-2', status: 'FAILED', retryCount: 2 }), // at the configured max (2) — must NOT retry
        task({ id: 'task-3', status: 'COMPLETED' }),
      ]);
      repository.updateTask.mockResolvedValue(task());
      repository.updateRun.mockResolvedValue(run({ status: 'RUNNING' }));
      repository.listToolCallLogsForTasks.mockResolvedValue(new Map());

      await service.retry('run-1');

      expect(repository.updateTask).toHaveBeenCalledTimes(1);
      expect(repository.updateTask).toHaveBeenCalledWith('task-1', {
        status: 'QUEUED',
        errorMessage: null,
        retryCount: 1,
      });
      expect(repository.updateRun).toHaveBeenCalledWith('run-1', {
        status: 'RUNNING',
        errorMessage: null,
        finishedAt: null,
      });
    });
  });

  describe('mergeOutputs (private, pure aggregation)', () => {
    function mergeOutputs(service: AgentOrchestratorService, tasks: AgentTaskRecord[]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (service as any).mergeOutputs(tasks) as {
        resultSummary: string;
        summaryLines: string[];
        confidenceScore: number | null;
        allFailed: boolean;
      };
    }

    it('reports allFailed and a placeholder summary when there are no top-level tasks', () => {
      const { service } = buildService();
      const result = mergeOutputs(service, []);
      expect(result).toEqual({
        resultSummary: 'No tasks were executed.',
        summaryLines: [],
        confidenceScore: null,
        allFailed: true,
      });
    });

    it('is not allFailed when at least one top-level task completed', () => {
      const { service } = buildService();
      const result = mergeOutputs(service, [
        task({ id: 't1', parentTaskId: null, status: 'COMPLETED', confidenceScore: 0.9 }),
        task({ id: 't2', parentTaskId: null, status: 'FAILED', confidenceScore: null }),
      ]);
      expect(result.allFailed).toBe(false);
    });

    it('is allFailed only when every top-level task failed or was cancelled', () => {
      const { service } = buildService();
      const result = mergeOutputs(service, [
        task({ id: 't1', parentTaskId: null, status: 'FAILED' }),
        task({ id: 't2', parentTaskId: null, status: 'CANCELLED' }),
      ]);
      expect(result.allFailed).toBe(true);
    });

    it('ignores sub-tasks (non-null parentTaskId) when merging', () => {
      const { service } = buildService();
      const result = mergeOutputs(service, [
        task({ id: 't1', parentTaskId: null, status: 'COMPLETED' }),
        task({ id: 't2', parentTaskId: 't1', status: 'FAILED' }),
      ]);
      expect(result.summaryLines).toHaveLength(1);
      expect(result.allFailed).toBe(false);
    });

    it('averages confidenceScore across top-level tasks that reported one', () => {
      const { service } = buildService();
      const result = mergeOutputs(service, [
        task({ id: 't1', parentTaskId: null, status: 'COMPLETED', confidenceScore: 0.6 }),
        task({ id: 't2', parentTaskId: null, status: 'COMPLETED', confidenceScore: 0.8 }),
        task({ id: 't3', parentTaskId: null, status: 'COMPLETED', confidenceScore: null }),
      ]);
      expect(result.confidenceScore).toBeCloseTo(0.7);
    });

    it('formats each summary line as "[agentType] title — status: reasoning"', () => {
      const { service } = buildService();
      const result = mergeOutputs(service, [
        task({
          id: 't1',
          parentTaskId: null,
          agentType: 'WEB',
          title: 'Crawl the app',
          status: 'COMPLETED',
          reasoningSummary: 'Found 3 endpoints.',
        }),
      ]);
      expect(result.summaryLines[0]).toBe('[WEB] Crawl the app — done: Found 3 endpoints.');
    });
  });

  describe('toTaskDto skipChildren fast path (task #235)', () => {
    function toTaskDto(
      service: AgentOrchestratorService,
      t: AgentTaskRecord,
      opts: { skipChildren?: boolean } = {},
    ) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (service as any).toTaskDto(t, opts);
    }

    it('skips listToolCallLogsForTask/listSubTasks entirely when skipChildren is true', async () => {
      const { service, repository } = buildService();

      const dto = await toTaskDto(service, task(), { skipChildren: true });

      expect(repository.listToolCallLogsForTask).not.toHaveBeenCalled();
      expect(repository.listSubTasks).not.toHaveBeenCalled();
      expect(dto.toolCalls).toEqual([]);
      expect(dto.subTasks).toEqual([]);
    });

    it('fetches tool calls and sub-tasks when skipChildren is not set', async () => {
      const { service, repository } = buildService();
      repository.listToolCallLogsForTask.mockResolvedValue([]);
      repository.listSubTasks.mockResolvedValue([task({ id: 'task-2', parentTaskId: 'task-1' })]);

      const dto = await toTaskDto(service, task());

      expect(repository.listToolCallLogsForTask).toHaveBeenCalledWith('task-1');
      expect(repository.listSubTasks).toHaveBeenCalledWith('task-1');
      expect(dto.subTasks).toHaveLength(1);
    });
  });
});
