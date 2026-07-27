import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventBus } from '@nestjs/cqrs';
import type { Subject } from 'rxjs';
import type {
  AgentType,
  OrchestrationPlanDto,
  OrchestrationRunDto,
  OrchestrationStreamEvent,
} from '@pentesthub/shared';
import { AGENT_TYPES, AI_PROVIDER_NAMES } from '@pentesthub/shared';
import type { AiProviderName } from '@pentesthub/shared';
import type { EnvConfig } from '../../../config/env.validation.js';
import {
  AGENT_ORCHESTRATION_REPOSITORY,
  type AgentOrchestrationRepository,
  type AgentTaskRecord,
  type AgentToolCallLogRecord,
  type OrchestrationRunRecord,
} from '../domain/repositories/agent-orchestration.repository.interface.js';
import { AiProviderRegistryService } from '../../ai/providers/ai-provider-registry.service.js';
import { collectStreamedCompletion } from '../../ai/providers/collect-stream.util.js';
import { AiMemoryService } from '../../ai/memory/ai-memory.service.js';
import { AgentRegistryService } from '../agents/agent-registry.service.js';
import type { AgentExecutionInput, AgentUpstreamResult } from '../agents/base-agent.js';
import { extractAgentJson } from '../agents/prompt-driven-agent.base.js';
import {
  ReasoningEngineService,
  type SelfEvaluationResult,
} from '../reasoning/reasoning-engine.service.js';
import { AgentOrchestrationStreamHubService } from './agent-orchestration-stream-hub.service.js';
import {
  buildTaskTree,
  toAgentTaskDto,
  toOrchestrationRunDto,
} from '../mappers/to-orchestration-run-dto.mapper.js';
import {
  OrchestrationRunCancelledEvent,
  OrchestrationRunCompletedEvent,
  OrchestrationRunCreatedEvent,
  OrchestrationRunFailedEvent,
} from '../events/orchestration-run-events.js';

type OrchestrationStream = Subject<OrchestrationStreamEvent>;

function isValidProviderName(value: string | undefined): value is AiProviderName {
  return !!value && (AI_PROVIDER_NAMES as string[]).includes(value);
}

interface PlanStep {
  agentType: AgentType;
  title: string;
  dependsOnStepIndexes: number[];
  input?: Record<string, unknown>;
}

/// The Master AI Orchestrator: "receive user goals, break work into
/// subtasks, assign agents, monitor execution, retry failed tasks, merge
/// outputs, produce final report." One OrchestrationRun = one user goal;
/// its AgentTask tree is the subtask breakdown, executed here respecting
/// per-step dependencies (AI_ORCHESTRATOR_MAX_CONCURRENT_TASKS at a time),
/// with automatic retry (AI_ORCHESTRATOR_MAX_TASK_RETRIES) and a wall-clock
/// budget per task (AI_ORCHESTRATOR_TASK_TIMEOUT_MS).
///
/// Follows the exact same "create row, kick off in background, stream via
/// hub" shape as AiChatService.startTurn/runGeneration — see that file's
/// doc comment. Each agent may now run its own internal AI Tool Calling
/// loop (PromptDrivenAgent.execute, task #224) before returning — this
/// file's scheduling logic doesn't need to know that happened, it only
/// awaits `agent.execute(...)` and persists whatever AgentToolCallLog
/// entries came back on `result.toolCalls`.
@Injectable()
export class AgentOrchestratorService {
  private readonly logger = new Logger(AgentOrchestratorService.name);

  constructor(
    @Inject(AGENT_ORCHESTRATION_REPOSITORY)
    private readonly repository: AgentOrchestrationRepository,
    private readonly agentRegistry: AgentRegistryService,
    private readonly providerRegistry: AiProviderRegistryService,
    private readonly memoryService: AiMemoryService,
    private readonly reasoningEngine: ReasoningEngineService,
    private readonly streamHub: AgentOrchestrationStreamHubService,
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly eventBus: EventBus,
  ) {}

  async startRun(input: {
    workspaceId: string;
    projectId: string | null;
    userId: string;
    goal: string;
    provider?: string;
    model?: string;
  }): Promise<OrchestrationRunDto> {
    const run = await this.repository.createRun({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      userId: input.userId,
      goal: input.goal,
    });

    this.eventBus.publish(
      new OrchestrationRunCreatedEvent(run.workspaceId, run.projectId, run.userId, run.id, {
        goal: run.goal,
      }),
    );

    this.streamHub.start(run.id);
    void this.execute(run, { provider: input.provider, model: input.model });

    return toOrchestrationRunDto(run);
  }

  async getRun(id: string): Promise<OrchestrationRunDto | null> {
    const run = await this.repository.findRunById(id);
    if (!run) return null;
    const tasks = await this.repository.listTasksForRun(id);
    const toolCallsByTaskId = await this.toolCallsByTaskId(tasks);
    return toOrchestrationRunDto(run, buildTaskTree(tasks, toolCallsByTaskId));
  }

  cancel(orchestrationRunId: string): boolean {
    return this.streamHub.cancel(orchestrationRunId);
  }

  async retry(orchestrationRunId: string): Promise<OrchestrationRunDto | null> {
    const run = await this.repository.findRunById(orchestrationRunId);
    if (!run || run.status !== 'FAILED') return this.getRun(orchestrationRunId);

    const tasks = await this.repository.listTasksForRun(orchestrationRunId);
    const maxRetries = this.configService.get('AI_ORCHESTRATOR_MAX_TASK_RETRIES', {
      infer: true,
    });
    for (const task of tasks) {
      if (task.status === 'FAILED' && task.retryCount < maxRetries) {
        await this.repository.updateTask(task.id, {
          status: 'QUEUED',
          errorMessage: null,
          retryCount: task.retryCount + 1,
        });
      }
    }

    const updatedRun = await this.repository.updateRun(orchestrationRunId, {
      status: 'RUNNING',
      errorMessage: null,
      finishedAt: null,
    });
    this.streamHub.start(orchestrationRunId);
    void this.execute(updatedRun, {});
    return this.getRun(orchestrationRunId);
  }

  private async execute(
    run: OrchestrationRunRecord,
    options: { provider?: string; model?: string },
  ): Promise<void> {
    const stream = this.streamHub.get(run.id);
    if (!stream) return;
    const { subject, controller } = stream;

    try {
      await this.repository.updateRun(run.id, {
        status: 'PLANNING',
        startedAt: run.startedAt ?? new Date(),
      });

      // A retried run already has AgentTask rows — only plan+create tasks
      // for a fresh run.
      let tasks = await this.repository.listTasksForRun(run.id);
      if (tasks.length === 0) {
        const plan = await this.planGoal(run, options);
        await this.repository.updateRun(run.id, {
          planJson: plan as unknown as Record<string, unknown>,
        });
        subject.next({ type: 'plan', plan });

        const stepTaskIds: string[] = [];
        for (const step of plan.steps) {
          const dependsOnTaskIds = step.dependsOnStepIndexes
            .map((i) => stepTaskIds[i])
            .filter((id): id is string => !!id);
          const task = await this.repository.createTask({
            orchestrationRunId: run.id,
            parentTaskId: null,
            agentType: step.agentType,
            title: step.title,
            input: {
              ...(step.input ?? {}),
              __dependsOnTaskIds: dependsOnTaskIds,
            },
          });
          stepTaskIds.push(task.id);
        }
        tasks = await this.repository.listTasksForRun(run.id);
      }

      await this.repository.updateRun(run.id, { status: 'RUNNING' });
      await this.runTaskGraph(run, tasks, controller.signal, subject, options);

      const finalTasks = await this.repository.listTasksForRun(run.id);
      if (controller.signal.aborted) {
        await this.finishCancelled(run, finalTasks, subject);
        return;
      }

      const merged = this.mergeOutputs(finalTasks);

      // Reasoning Engine — Self-Evaluation: an independent critique pass
      // over the merged result before it's reported as done, rather than
      // trusting each agent's own "completed" status at face value. Only
      // runs for non-failed runs — a run where every top-level task
      // already failed doesn't need a critique to know it fell short.
      const evaluation: SelfEvaluationResult = merged.allFailed
        ? { confidenceScore: merged.confidenceScore, critique: '', recommendedFollowUps: [] }
        : await this.reasoningEngine.selfEvaluate({
            workspaceId: run.workspaceId,
            goal: run.goal,
            taskSummaryLines: merged.summaryLines,
            averageTaskConfidence: merged.confidenceScore,
          });

      const resultSummary =
        evaluation.critique || evaluation.recommendedFollowUps.length > 0
          ? [
              merged.resultSummary,
              evaluation.critique ? `\nSelf-evaluation: ${evaluation.critique}` : '',
              evaluation.recommendedFollowUps.length > 0
                ? `\nRecommended follow-ups:\n${evaluation.recommendedFollowUps.map((f) => `- ${f}`).join('\n')}`
                : '',
            ]
              .filter(Boolean)
              .join('')
          : merged.resultSummary;

      const finalRun = await this.repository.updateRun(run.id, {
        status: merged.allFailed ? 'FAILED' : 'COMPLETED',
        resultSummary,
        confidenceScore: evaluation.confidenceScore,
        finishedAt: new Date(),
        errorMessage: merged.allFailed
          ? 'Every top-level task in this run failed.'
          : null,
      });

      const runDto = toOrchestrationRunDto(
        finalRun,
        buildTaskTree(finalTasks, await this.toolCallsByTaskId(finalTasks)),
      );
      subject.next(
        merged.allFailed
          ? { type: 'run_failed', message: finalRun.errorMessage ?? 'Run failed.' }
          : { type: 'run_completed', run: runDto },
      );
      this.streamHub.complete(run.id);

      this.eventBus.publish(
        merged.allFailed
          ? new OrchestrationRunFailedEvent(run.workspaceId, run.projectId, run.userId, run.id, {
              errorMessage: finalRun.errorMessage,
            })
          : new OrchestrationRunCompletedEvent(
              run.workspaceId,
              run.projectId,
              run.userId,
              run.id,
              { confidenceScore: finalRun.confidenceScore },
            ),
      );

      void this.memoryService
        .indexContent({
          workspaceId: run.workspaceId,
          projectId: run.projectId,
          sourceType: 'ORCHESTRATION_RUN',
          sourceId: run.id,
          content: `Goal: ${run.goal}\n\n${merged.resultSummary}`,
        })
        .catch((error: unknown) =>
          this.logger.warn(`Failed to index orchestration memory: ${String(error)}`),
        );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Orchestration run ${run.id} failed: ${message}`);
      await this.repository
        .updateRun(run.id, {
          status: 'FAILED',
          errorMessage: message,
          finishedAt: new Date(),
        })
        .catch(() => undefined);
      subject.next({ type: 'run_failed', message });
      this.streamHub.complete(run.id);
      this.eventBus.publish(
        new OrchestrationRunFailedEvent(run.workspaceId, run.projectId, run.userId, run.id, {
          errorMessage: message,
        }),
      );
    }
  }

  /// Runs every AgentTask belonging to this run/its descendants to
  /// completion, respecting each task's `__dependsOnTaskIds` and the
  /// configured concurrency cap. A WORKFLOW_COORDINATOR task that proposes
  /// sub-tasks gets them appended to the in-flight set as children
  /// (Task Delegation) — this loop keeps scheduling until nothing is left
  /// QUEUED/RUNNING.
  private async runTaskGraph(
    run: OrchestrationRunRecord,
    initialTasks: AgentTaskRecord[],
    signal: AbortSignal,
    subject: OrchestrationStream,
    options: { provider?: string; model?: string },
  ): Promise<void> {
    const maxConcurrent = this.configService.get(
      'AI_ORCHESTRATOR_MAX_CONCURRENT_TASKS',
      { infer: true },
    );
    const maxRetries = this.configService.get('AI_ORCHESTRATOR_MAX_TASK_RETRIES', {
      infer: true,
    });
    const maxDepth = this.configService.get('AI_ORCHESTRATOR_MAX_TASK_DEPTH', {
      infer: true,
    });
    const timeoutMs = this.configService.get('AI_ORCHESTRATOR_TASK_TIMEOUT_MS', {
      infer: true,
    });

    const tasksById = new Map(initialTasks.map((t) => [t.id, t]));
    const running = new Map<string, Promise<void>>();

    const isReady = (task: AgentTaskRecord): boolean => {
      const dependsOnTaskIds =
        (task.input?.__dependsOnTaskIds as string[] | undefined) ?? [];
      return dependsOnTaskIds.every(
        (id) => tasksById.get(id)?.status === 'COMPLETED',
      );
    };

    for (;;) {
      if (signal.aborted) break;

      const pending = [...tasksById.values()].filter(
        (t) => t.status === 'QUEUED' && isReady(t),
      );
      const capacity = maxConcurrent - running.size;
      const toStart = pending.slice(0, Math.max(0, capacity));

      for (const task of toStart) {
        const depth = await this.taskDepth(task);
        const promise = this.runOneTask(run, task, {
          signal,
          timeoutMs,
          maxRetries,
          maxDepth,
          depth,
          subject,
          tasksById,
          options,
        }).finally(() => running.delete(task.id));
        running.set(task.id, promise);
      }

      const stillPending = [...tasksById.values()].some(
        (t) => t.status === 'QUEUED' || t.status === 'RUNNING' || t.status === 'RETRYING',
      );
      if (!stillPending && running.size === 0) break;
      if (running.size > 0) {
        await Promise.race(running.values());
      } else if (stillPending) {
        // Nothing runnable yet (all remaining are waiting on a dependency
        // that itself failed and won't retry) — nothing left to do.
        const anyBlockedOnFailedDep = [...tasksById.values()].some(
          (t) =>
            t.status === 'QUEUED' &&
            ((t.input?.__dependsOnTaskIds as string[] | undefined) ?? []).some(
              (id) => tasksById.get(id)?.status === 'FAILED',
            ),
        );
        if (anyBlockedOnFailedDep) {
          for (const t of tasksById.values()) {
            if (t.status !== 'QUEUED') continue;
            const updated = await this.repository.updateTask(t.id, {
              status: 'FAILED',
              errorMessage: 'A dependency failed; this task was never started.',
              finishedAt: new Date(),
            });
            tasksById.set(t.id, updated);
          }
        }
        break;
      }
    }
  }

  private async taskDepth(task: AgentTaskRecord): Promise<number> {
    let depth = 0;
    let current = task;
    while (current.parentTaskId) {
      const parent = await this.repository.findTaskById(current.parentTaskId);
      if (!parent) break;
      depth += 1;
      current = parent;
    }
    return depth;
  }

  private async runOneTask(
    run: OrchestrationRunRecord,
    task: AgentTaskRecord,
    ctx: {
      signal: AbortSignal;
      timeoutMs: number;
      maxRetries: number;
      maxDepth: number;
      depth: number;
      subject: OrchestrationStream;
      tasksById: Map<string, AgentTaskRecord>;
      options: { provider?: string; model?: string };
    },
  ): Promise<void> {
    const startedTask = await this.repository.updateTask(task.id, {
      status: 'RUNNING',
      startedAt: new Date(),
    });
    ctx.tasksById.set(task.id, startedTask);
    ctx.subject.next({
      type: 'task_started',
      task: await this.toTaskDto(startedTask, { skipChildren: true }),
    });

    try {
      const agent = this.agentRegistry.get(task.agentType);
      const dependsOnTaskIds =
        (task.input?.__dependsOnTaskIds as string[] | undefined) ?? [];
      const upstreamContext: AgentUpstreamResult[] = [];
      for (const depId of dependsOnTaskIds) {
        const depTask = ctx.tasksById.get(depId) ?? (await this.repository.findTaskById(depId));
        if (depTask) {
          upstreamContext.push({
            agentType: depTask.agentType,
            title: depTask.title,
            output: depTask.output,
          });
        }
      }

      const agentInput: AgentExecutionInput = {
        workspaceId: run.workspaceId,
        projectId: run.projectId,
        userId: run.userId,
        title: task.title,
        input: stripInternalFields(task.input),
        upstreamContext,
        provider: ctx.options.provider,
        model: ctx.options.model,
      };

      const result = await withTimeout(
        agent.execute(agentInput, ctx.signal),
        ctx.timeoutMs,
      );

      for (const call of result.toolCalls) {
        await this.repository.createToolCallLog({
          agentTaskId: task.id,
          toolName: call.toolName,
          input: call.input,
          output: call.output,
          errorMessage: call.errorMessage,
          durationMs: call.durationMs,
        });
      }

      const completed = await this.repository.updateTask(task.id, {
        status: 'COMPLETED',
        output: result.output,
        reasoningSummary: result.reasoningSummary,
        confidenceScore: result.confidenceScore,
        sources: result.sources,
        finishedAt: new Date(),
      });
      ctx.tasksById.set(task.id, completed);
      ctx.subject.next({ type: 'task_completed', task: await this.toTaskDto(completed) });

      // Task Delegation: a Workflow Coordinator task that decided to split
      // further gets its proposed sub-tasks created as children, provided
      // the depth budget allows it.
      if (
        task.agentType === 'WORKFLOW_COORDINATOR' &&
        result.output.shouldDelegate === true &&
        ctx.depth < ctx.maxDepth
      ) {
        const subTasks = Array.isArray(result.output.subTasks)
          ? (result.output.subTasks as {
              agentType?: unknown;
              title?: unknown;
            }[])
          : [];
        for (const sub of subTasks) {
          if (typeof sub.agentType !== 'string' || typeof sub.title !== 'string') continue;
          if (!AGENT_TYPES.includes(sub.agentType as AgentType)) continue;
          const child = await this.repository.createTask({
            orchestrationRunId: run.id,
            parentTaskId: task.id,
            agentType: sub.agentType as AgentType,
            title: sub.title,
            input: {},
          });
          ctx.tasksById.set(child.id, child);
        }
      }
    } catch (error) {
      const timedOut = error instanceof TimeoutError;
      const cancelled = ctx.signal.aborted && !timedOut;
      const message = error instanceof Error ? error.message : 'Agent execution failed';

      const latest = ctx.tasksById.get(task.id) ?? task;
      const canRetry = !cancelled && latest.retryCount < ctx.maxRetries;

      const updated = await this.repository.updateTask(task.id, {
        status: cancelled ? 'CANCELLED' : canRetry ? 'QUEUED' : 'FAILED',
        errorMessage: cancelled ? null : message,
        retryCount: canRetry ? latest.retryCount + 1 : latest.retryCount,
        finishedAt: cancelled || !canRetry ? new Date() : null,
      });
      ctx.tasksById.set(task.id, updated);

      if (!canRetry) {
        ctx.subject.next({ type: 'task_failed', task: await this.toTaskDto(updated) });
      }
    }
  }

  private async finishCancelled(
    run: OrchestrationRunRecord,
    tasks: AgentTaskRecord[],
    subject: OrchestrationStream,
  ): Promise<void> {
    for (const task of tasks) {
      if (task.status === 'QUEUED' || task.status === 'RUNNING') {
        await this.repository.updateTask(task.id, {
          status: 'CANCELLED',
          finishedAt: new Date(),
        });
      }
    }
    await this.repository.updateRun(run.id, {
      status: 'CANCELLED',
      finishedAt: new Date(),
    });
    subject.next({ type: 'cancelled' });
    this.streamHub.complete(run.id);
    this.eventBus.publish(
      new OrchestrationRunCancelledEvent(run.workspaceId, run.projectId, run.userId, run.id),
    );
  }

  private mergeOutputs(tasks: AgentTaskRecord[]): {
    resultSummary: string;
    summaryLines: string[];
    confidenceScore: number | null;
    allFailed: boolean;
  } {
    const topLevel = tasks.filter((t) => !t.parentTaskId);
    if (topLevel.length === 0) {
      return {
        resultSummary: 'No tasks were executed.',
        summaryLines: [],
        confidenceScore: null,
        allFailed: true,
      };
    }
    const allFailed = topLevel.every((t) => t.status === 'FAILED' || t.status === 'CANCELLED');
    const lines = topLevel.map((t) => {
      const status = t.status === 'COMPLETED' ? 'done' : t.status.toLowerCase();
      const summary = t.reasoningSummary ?? '(no summary)';
      return `[${t.agentType}] ${t.title} — ${status}: ${summary}`;
    });
    const confidences = topLevel
      .map((t) => t.confidenceScore)
      .filter((c): c is number => c !== null);
    const confidenceScore =
      confidences.length > 0
        ? confidences.reduce((a, b) => a + b, 0) / confidences.length
        : null;

    return {
      resultSummary: lines.join('\n'),
      summaryLines: lines,
      confidenceScore,
      allFailed,
    };
  }

  /// Module 11 — Performance optimizations (task #235): one batched
  /// listToolCallLogsForTasks query instead of one listToolCallLogsForTask
  /// round-trip per task.
  private async toolCallsByTaskId(
    tasks: AgentTaskRecord[],
  ): Promise<Map<string, AgentToolCallLogRecord[]>> {
    return this.repository.listToolCallLogsForTasks(tasks.map((t) => t.id));
  }

  /// Module 11 — Performance optimizations (task #235): a task that was
  /// just created (the `task_started` stream event, emitted the instant a
  /// task is picked up — see runOneTask) cannot yet have any tool calls or
  /// sub-tasks, so skip both DB round-trips for that call site.
  private async toTaskDto(task: AgentTaskRecord, opts: { skipChildren?: boolean } = {}) {
    if (opts.skipChildren) {
      return toAgentTaskDto(task, [], []);
    }
    const toolCalls = await this.repository.listToolCallLogsForTask(task.id);
    const subTasks = await this.repository.listSubTasks(task.id);
    return toAgentTaskDto(
      task,
      toolCalls,
      subTasks.map((s) => toAgentTaskDto(s)),
    );
  }

  /// Reasoning Engine's Planning + Task Decomposition, at the top level:
  /// turns a free-text goal into an ordered OrchestrationPlanDto. Uses the
  /// same "respond with ONLY JSON" convention as every other AI-module
  /// prompt rather than a dedicated PlanningAgent, since planning isn't a
  /// specialist's job — it's the orchestrator reasoning about which
  /// specialists to involve.
  private async planGoal(
    run: OrchestrationRunRecord,
    options: { provider?: string; model?: string },
  ): Promise<OrchestrationPlanDto> {
    const preferred = isValidProviderName(options.provider) ? options.provider : null;
    const { provider, credential } = await this.providerRegistry.resolveProvider(
      run.workspaceId,
      preferred,
    );
    const model = options.model ?? provider.getDefaultModel(credential);

    const systemPrompt = `You are the Master AI Orchestrator for an autonomous penetration-testing platform. Given a user's goal, break it into an ordered list of steps, each assigned to exactly one specialist agent type from: ${AGENT_TYPES.join(', ')}. Respond with ONLY a single JSON object: { "steps": [{ "agentType": string, "title": string, "dependsOnStepIndexes": number[] }], "alternativesConsidered": string[], "reasoningSummary": string }. "dependsOnStepIndexes" references earlier steps (0-based) whose output this step needs before it can start — empty array if it can run immediately. Keep the plan to 2-8 steps; prefer fewer, well-scoped steps over many redundant ones.`;

    const text = await collectStreamedCompletion(
      provider,
      {
        model,
        maxTokens: this.configService.get('AI_CHAT_STREAM_MAX_TOKENS', { infer: true }),
        temperature: 0.3,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Goal: ${run.goal}` },
        ],
      },
      credential,
    );

    const parsed = extractAgentJson<{
      steps?: unknown[];
      alternativesConsidered?: unknown[];
      reasoningSummary?: unknown;
    }>(text);

    const steps: PlanStep[] = Array.isArray(parsed?.steps)
      ? parsed!.steps
          .filter(
            (s): s is { agentType: unknown; title: unknown; dependsOnStepIndexes?: unknown } =>
              typeof s === 'object' && s !== null,
          )
          .filter(
            (s) => typeof s.agentType === 'string' && AGENT_TYPES.includes(s.agentType as AgentType) && typeof s.title === 'string',
          )
          .map((s) => ({
            agentType: s.agentType as AgentType,
            title: s.title as string,
            dependsOnStepIndexes: Array.isArray(s.dependsOnStepIndexes)
              ? s.dependsOnStepIndexes.filter((i): i is number => typeof i === 'number')
              : [],
          }))
      : [];

    // A model that returns no usable steps still gets a fallback plan
    // (Error recovery) rather than a run with zero tasks — a single
    // AI_RESEARCH step framing the goal, so the run produces *something*.
    const finalSteps = steps.length > 0 ? steps : [
      { agentType: 'AI_RESEARCH' as AgentType, title: run.goal, dependsOnStepIndexes: [] },
    ];

    return {
      steps: finalSteps,
      alternativesConsidered: Array.isArray(parsed?.alternativesConsidered)
        ? parsed!.alternativesConsidered.filter((s): s is string => typeof s === 'string')
        : [],
      reasoningSummary:
        typeof parsed?.reasoningSummary === 'string'
          ? parsed!.reasoningSummary
          : `Decomposed goal into ${finalSteps.length} step(s).`,
    };
  }
}

class TimeoutError extends Error {
  constructor() {
    super('Agent task timed out');
    this.name = 'TimeoutError';
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError()), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

function stripInternalFields(
  input: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!input) return null;
  const { __dependsOnTaskIds, ...rest } = input;
  return rest;
}
