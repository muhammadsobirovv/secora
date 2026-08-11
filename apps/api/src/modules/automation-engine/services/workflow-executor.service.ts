import { Injectable, Logger } from '@nestjs/common';
import { CommandBus, EventBus } from '@nestjs/cqrs';
import type { WorkflowConditionOperator, WorkflowDefinition, WorkflowStepDefinition } from '@pentesthub/shared';
import type { Prisma } from '../../../prisma-types.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { ExecuteIntegrationActionCommand } from '../../integrations/commands/integration-actions.commands.js';
import { AiProviderRegistryService } from '../../ai/providers/ai-provider-registry.service.js';
import { collectStreamedCompletion } from '../../ai/providers/collect-stream.util.js';
import { NotificationDispatcherService } from '../../notifications-channels/services/notification-dispatcher.service.js';
import { ReportContentBuilderService } from '../../enterprise-reporting/report-content-builder.service.js';
import { AgentOrchestratorService } from '../../agent/orchestrator/agent-orchestrator.service.js';
import { getByPath, evaluateCondition } from '../workflow-context.util.js';
import { withSpan } from '../../../observability/tracing.js';
import { MetricsRegistryService } from '../../observability/metrics-registry.service.js';
import { WorkflowRunFinishedEvent, WorkflowRunStartedEvent } from '../events/workflow-run-events.js';

interface StepResult {
  output?: unknown;
  message?: string;
  pause?: boolean;
  /// `undefined` (delay's normal case) leaves the field untouched in
  /// the Prisma update; `null` (approval's case, task #283) explicitly
  /// clears it so WorkflowRunnerService's `resumeAt <= now()` poller
  /// never picks this run back up — only an explicit `resumeApproval()`
  /// call can.
  resumeAt?: Date | null;
  /// Explicit override for which step runs next — used by `condition`
  /// (branches instead of following `step.next`). `undefined` means
  /// "fall through to step.next"; `null` means "end the run here".
  nextOverride?: string | null;
}

/// Interprets one `WorkflowDefinition` step graph for a single
/// `WorkflowRun`. Each step kind either delegates to a real existing
/// subsystem (report -> ReportContentBuilderService, notify ->
/// NotificationDispatcherService, ai_analysis -> AiProviderRegistryService
/// + collectStreamedCompletion, create_ticket/sync_data ->
/// ExecuteIntegrationActionCommand via CommandBus) or, for recon/scan —
/// which need a specific target + tool selection this generic engine
/// doesn't always have — honestly records the intent as a
/// ScheduledJobRunnerService-style "would trigger X" result rather than
/// fabricating a real ReconJob/VulnScanJob row from incomplete
/// parameters (see that service's doc comment for the same reasoning
/// applied to its DAILY_RECON/WEEKLY_NUCLEI kinds).
///
/// `condition`/`loop`/`delay` are pure control flow, executed entirely
/// in-process (no external system involved). `delay` is the one kind
/// that doesn't complete synchronously: it returns `pause: true` and the
/// run sits with `pausedAtStepKey` set until WorkflowRunnerService's tick
/// notices `resumeAt` has passed and calls `resume()`.
@Injectable()
export class WorkflowExecutorService {
  private readonly logger = new Logger(WorkflowExecutorService.name);
  private static readonly MAX_STEPS_PER_RUN = 200; // guards against a cyclic definition looping forever

  constructor(
    private readonly prisma: PrismaService,
    private readonly commandBus: CommandBus,
    private readonly eventBus: EventBus,
    private readonly providerRegistry: AiProviderRegistryService,
    private readonly notificationDispatcher: NotificationDispatcherService,
    private readonly reportContentBuilder: ReportContentBuilderService,
    private readonly metrics: MetricsRegistryService,
    private readonly agentOrchestrator: AgentOrchestratorService,
  ) {}

  async start(runId: string): Promise<void> {
    const run = await this.prisma.workflowRun.findUniqueOrThrow({ where: { id: runId }, include: { workflow: true } });
    const definition = run.workflow.definitionJson as unknown as WorkflowDefinition;
    await this.prisma.workflowRun.update({
      where: { id: runId },
      data: { status: 'RUNNING', startedAt: new Date(), contextJson: (run.input as Prisma.InputJsonValue) ?? {} },
    });
    // Event Bus (task #284) — "Workflow Started".
    this.eventBus.publish(
      new WorkflowRunStartedEvent(run.id, run.workflowId, run.workflow.workspaceId, run.workflow.organizationId),
    );
    await this.advance(runId, definition, definition.startAt);
  }

  async resume(runId: string): Promise<void> {
    const run = await this.prisma.workflowRun.findUniqueOrThrow({ where: { id: runId }, include: { workflow: true } });
    if (run.status !== 'RUNNING' || !run.pausedAtStepKey) return;
    const definition = run.workflow.definitionJson as unknown as WorkflowDefinition;
    const pausedStep = definition.steps.find((s) => s.key === run.pausedAtStepKey);

    await this.prisma.workflowRun.update({ where: { id: runId }, data: { pausedAtStepKey: null, resumeAt: null } });

    const nextKey = pausedStep?.next ?? null;
    if (!nextKey) {
      await this.finish(runId, 'SUCCEEDED', null);
      return;
    }
    await this.advance(runId, definition, nextKey);
  }

  /// Approval-specific counterpart to `resume()` (task #283) — called
  /// from `POST /workflows/.../approve`, never from
  /// `WorkflowRunnerService`'s poller (an `approval` step's
  /// `resumeAt` is always `null`, see that case in `executeStep`).
  /// Branches to `step.next` if approved, `step.onFailure` if rejected
  /// — the same two-outcome shape `condition`'s `whenTrue`/`whenFalse`
  /// uses, reusing the field every step already has instead of adding a
  /// third pointer just for this one kind.
  async resumeApproval(runId: string, approved: boolean, note: string | undefined): Promise<void> {
    const run = await this.prisma.workflowRun.findUniqueOrThrow({ where: { id: runId }, include: { workflow: true } });
    if (run.status !== 'RUNNING' || !run.pausedAtStepKey) {
      throw new Error('This workflow run is not awaiting approval.');
    }
    const definition = run.workflow.definitionJson as unknown as WorkflowDefinition;
    const pausedStep = definition.steps.find((s) => s.key === run.pausedAtStepKey);
    if (!pausedStep || pausedStep.kind !== 'approval') {
      throw new Error('This workflow run is not paused at an approval step.');
    }

    const context = ((run.contextJson as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
    context[pausedStep.key] = { ...(context[pausedStep.key] as Record<string, unknown> | null), approved, note: note ?? null };

    await this.prisma.workflowRun.update({
      where: { id: runId },
      data: { pausedAtStepKey: null, resumeAt: null, contextJson: context as Prisma.InputJsonValue },
    });

    const nextKey = approved ? (pausedStep.next ?? null) : (pausedStep.onFailure ?? null);
    if (!nextKey) {
      await this.finish(runId, approved ? 'SUCCEEDED' : 'FAILED', approved ? null : `Approval rejected${note ? `: ${note}` : '.'}`);
      return;
    }
    await this.advance(runId, definition, nextKey);
  }

  private async advance(runId: string, definition: WorkflowDefinition, startStepKey: string): Promise<void> {
    let currentKey: string | null = startStepKey;
    let stepsExecuted = 0;

    while (currentKey) {
      if (++stepsExecuted > WorkflowExecutorService.MAX_STEPS_PER_RUN) {
        await this.finish(runId, 'FAILED', `Exceeded ${WorkflowExecutorService.MAX_STEPS_PER_RUN} steps — possible cycle in workflow definition.`);
        return;
      }

      const step = definition.steps.find((s) => s.key === currentKey);
      if (!step) {
        await this.finish(runId, 'FAILED', `Unknown step "${currentKey}".`);
        return;
      }

      const run = await this.prisma.workflowRun.findUniqueOrThrow({ where: { id: runId }, include: { workflow: true } });
      const context = ((run.contextJson as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;

      const log = await this.prisma.workflowStepLog.create({
        data: { workflowRunId: runId, stepKey: step.key, status: 'RUNNING' },
      });

      try {
        const result = await withSpan(`workflow.step.${step.kind}`, (span) => {
          span.setAttribute('workflow.step.key', step.key);
          span.setAttribute('workflow.run.id', runId);
          return this.executeStep(step, context, run.workflow);
        });
        context[step.key] = result.output ?? null;

        await this.prisma.workflowStepLog.update({
          where: { id: log.id },
          data: { status: 'SUCCEEDED', finishedAt: new Date(), message: result.message ?? null },
        });
        await this.prisma.workflowRun.update({
          where: { id: runId },
          data: { contextJson: context as Prisma.InputJsonValue },
        });

        if (result.pause) {
          await this.prisma.workflowRun.update({
            where: { id: runId },
            data: { pausedAtStepKey: step.key, resumeAt: result.resumeAt },
          });
          return;
        }

        currentKey = result.nextOverride !== undefined ? result.nextOverride : (step.next ?? null);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.prisma.workflowStepLog.update({
          where: { id: log.id },
          data: { status: 'FAILED', finishedAt: new Date(), message },
        });
        this.logger.warn(`Workflow run ${runId} step "${step.key}" failed: ${message}`);

        if (step.onFailure) {
          currentKey = step.onFailure;
          continue;
        }
        await this.finish(runId, 'FAILED', message);
        return;
      }
    }

    await this.finish(runId, 'SUCCEEDED', null);
  }

  private async finish(runId: string, status: 'SUCCEEDED' | 'FAILED', error: string | null): Promise<void> {
    const run = await this.prisma.workflowRun.findUniqueOrThrow({ where: { id: runId }, include: { workflow: true } });
    await this.prisma.workflowRun.update({
      where: { id: runId },
      data: {
        status,
        error,
        finishedAt: new Date(),
        output: (run.contextJson as Prisma.InputJsonValue) ?? {},
      },
    });
    this.metrics.workflowRunsTotal.inc({ workflowId: run.workflowId, status: status.toLowerCase() });
    // Event Bus (task #284) — "Workflow Finished".
    this.eventBus.publish(
      new WorkflowRunFinishedEvent(run.id, run.workflowId, run.workflow.workspaceId, run.workflow.organizationId, status),
    );
  }

  private async executeStep(
    step: WorkflowStepDefinition,
    context: Record<string, unknown>,
    workflow: { organizationId: string | null; workspaceId: string | null; createdBy: string },
  ): Promise<StepResult> {
    switch (step.kind) {
      case 'recon':
      case 'scan':
        // See class doc comment — recorded honestly, not fabricated.
        return {
          output: {
            kind: step.kind,
            note: 'Recorded — wire to ReconJob/VulnScanJob creation once a concrete targetId/tool is available.',
            targetId: step.params.targetId ?? null,
          },
        };

      case 'report': {
        if (!workflow.organizationId) {
          throw new Error('report step requires the workflow to have an organizationId.');
        }
        const content = await this.reportContentBuilder.build({
          organizationId: workflow.organizationId,
          workspaceId: (step.params.workspaceId as string | undefined) ?? workflow.workspaceId ?? null,
          periodStart: null,
          periodEnd: null,
        });
        const report = await this.prisma.enterpriseReport.create({
          data: {
            organizationId: workflow.organizationId,
            workspaceId: (step.params.workspaceId as string | undefined) ?? workflow.workspaceId ?? null,
            type: 'CUSTOM',
            title: (step.params.title as string | undefined) ?? `Workflow-generated report — ${new Date().toISOString().slice(0, 10)}`,
            contentJson: content as unknown as Prisma.InputJsonValue,
            generatedByAi: false,
          },
        });
        return { output: { reportId: report.id }, message: `Generated enterprise report ${report.id}.` };
      }

      case 'notify': {
        const userId = step.params.userId as string | undefined;
        const title = step.params.title as string | undefined;
        if (!userId || !title) throw new Error('notify step requires params.userId and params.title.');
        if (!workflow.workspaceId) throw new Error('notify step requires the workflow to have a workspaceId.');

        const body = (step.params.body as string | undefined) ?? null;
        const notification = await this.prisma.bugBountyNotification.create({
          data: { workspaceId: workflow.workspaceId, userId, type: 'WORKFLOW_ALERT', title, body },
        });
        await this.notificationDispatcher.dispatch(notification.id, workflow.workspaceId, userId, title, body);
        return { output: { notificationId: notification.id } };
      }

      case 'ai_analysis': {
        const prompt = step.params.prompt as string | undefined;
        if (!prompt) throw new Error('ai_analysis step requires params.prompt.');
        if (!workflow.workspaceId) throw new Error('ai_analysis step requires the workflow to have a workspaceId.');

        const { provider, credential } = await this.providerRegistry.resolveProvider(workflow.workspaceId);
        const text = await collectStreamedCompletion(
          provider,
          {
            model: provider.getDefaultModel(credential),
            maxTokens: Math.min((step.params.maxTokens as number | undefined) ?? 800, 4000),
            messages: [
              {
                role: 'system',
                content: 'You are a security operations assistant analyzing data inside an automated workflow. Be concise and actionable.',
              },
              { role: 'user', content: prompt },
            ],
          },
          credential,
        );
        return { output: { text } };
      }

      case 'ai_agent_run': {
        // Module 11 — AI Workflow Automation. Unlike every other kind in
        // this switch, the underlying work (AgentOrchestratorService.
        // startRun) is itself fire-and-forget/background — it returns as
        // soon as the OrchestrationRun row + AgentTask plan exist, not
        // when the agents finish running. This step therefore records
        // "the run was started" as its output, the same shape recon/scan
        // use for "recorded, not awaited" — a workflow author who needs
        // to react to the *result* should follow up with a `condition`/
        // `delay` step polling the run, since AgentOrchestratorService
        // has no CQRS command surface yet (task #236) to await here even
        // if this step wanted to block.
        const goal = step.params.goal as string | undefined;
        if (!goal) throw new Error('ai_agent_run step requires params.goal.');
        if (!workflow.workspaceId) {
          throw new Error('ai_agent_run step requires the workflow to have a workspaceId.');
        }

        const run = await this.agentOrchestrator.startRun({
          workspaceId: workflow.workspaceId,
          projectId: (step.params.projectId as string | undefined) ?? null,
          userId: workflow.createdBy,
          goal,
          provider: step.params.provider as string | undefined,
          model: step.params.model as string | undefined,
        });
        return {
          output: { orchestrationRunId: run.id, status: run.status },
          message: `Started AI agent orchestration run ${run.id}.`,
        };
      }

      case 'create_ticket':
      case 'sync_data': {
        const organizationId = (step.params.organizationId as string | undefined) ?? workflow.organizationId ?? undefined;
        const connectionId = step.params.connectionId as string | undefined;
        const action = step.params.action as string | undefined;
        if (!organizationId || !connectionId || !action) {
          throw new Error(`${step.kind} step requires params.organizationId, params.connectionId, and params.action.`);
        }
        const result = await this.commandBus.execute(
          new ExecuteIntegrationActionCommand(workflow.createdBy, organizationId, connectionId, {
            action,
            payload: (step.params.payload as Record<string, unknown> | undefined) ?? {},
          }),
        );
        return { output: result };
      }

      case 'condition': {
        const field = step.params.field as string;
        const operator = step.params.operator as WorkflowConditionOperator;
        const value = step.params.value;
        const whenTrue = (step.params.whenTrue as string | null) ?? null;
        const whenFalse = (step.params.whenFalse as string | null) ?? null;
        const matched = evaluateCondition(context, operator, field, value);
        return { output: { matched }, nextOverride: matched ? whenTrue : whenFalse };
      }

      case 'loop': {
        const itemsField = step.params.itemsField as string;
        const nestedSteps = (step.params.steps as WorkflowStepDefinition[] | undefined) ?? [];
        const items = getByPath(context, itemsField);
        if (!Array.isArray(items)) throw new Error(`loop step's itemsField "${itemsField}" is not an array in the current context.`);

        const results: unknown[] = [];
        for (const item of items) {
          const loopContext: Record<string, unknown> = { ...context, loopItem: item };
          for (const nested of nestedSteps) {
            const nestedResult = await this.executeStep(nested, loopContext, workflow);
            loopContext[nested.key] = nestedResult.output ?? null;
          }
          results.push(loopContext);
        }
        return { output: { iterations: results.length, results } };
      }

      case 'delay': {
        const minutes = step.params.minutes as number;
        return { pause: true, resumeAt: new Date(Date.now() + minutes * 60_000), output: { delayedMinutes: minutes } };
      }

      // ---- Module 13 additions (task #283) ----

      case 'parallel': {
        const branches = (step.params.branches as WorkflowStepDefinition[][] | undefined) ?? [];
        const branchResults = await Promise.all(
          branches.map(async (branch) => {
            const branchContext: Record<string, unknown> = { ...context };
            for (const nested of branch) {
              const nestedResult = await this.executeStep(nested, branchContext, workflow);
              branchContext[nested.key] = nestedResult.output ?? null;
            }
            return branchContext;
          }),
        );
        return { output: { branches: branchResults.length, results: branchResults } };
      }

      case 'approval': {
        // Same pause mechanism `delay` uses (`pausedAtStepKey`), but with
        // `resumeAt: null` — WorkflowRunnerService's poller only resumes
        // runs where `resumeAt <= now()`, so a null `resumeAt` never
        // auto-resumes. Only `WorkflowExecutorService.resumeApproval()`
        // (called from the `POST .../approve` route) advances the run
        // past this step, choosing `step.next` (approved) or
        // `step.onFailure` (rejected) — see that method.
        return {
          pause: true,
          resumeAt: null,
          output: {
            awaitingApproval: true,
            approverUserId: step.params.approverUserId ?? null,
            approverRole: step.params.approverRole ?? null,
            message: step.params.message ?? null,
          },
        };
      }

      case 'export': {
        const format = (step.params.format as 'json' | 'csv' | 'markdown' | undefined) ?? 'json';
        const sourceField = step.params.sourceField as string;
        const data = getByPath(context, sourceField);
        return { output: { format, content: formatExport(format, data) } };
      }

      case 'webhook_call': {
        const url = step.params.url as string;
        const method = (step.params.method as 'GET' | 'POST' | 'PUT' | undefined) ?? 'POST';
        const headers = (step.params.headers as Record<string, string> | undefined) ?? {};
        const bodyField = step.params.bodyField as string | undefined;
        const body = bodyField ? getByPath(context, bodyField) : undefined;
        if (!url) throw new Error('webhook_call step requires params.url.');

        const response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json', ...headers },
          body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
        });
        const responseText = await response.text().catch(() => '');
        return {
          output: { status: response.status, ok: response.ok, body: responseText.slice(0, 10_000) },
          message: `${method} ${url} -> ${response.status}`,
        };
      }

      case 'set_variable': {
        const name = step.params.name as string;
        if (!name) throw new Error('set_variable step requires params.name.');
        const valueField = step.params.valueField as string | undefined;
        const value = 'value' in step.params ? step.params.value : valueField ? getByPath(context, valueField) : undefined;
        // Mutates the shared context object directly (not just this
        // step's own `context[step.key]` slot) so a *later* step can
        // reference it by the chosen variable name, not the step's key —
        // the entire point of `set_variable` over an ordinary step.
        context[name] = value ?? null;
        return { output: { name, value: value ?? null } };
      }

      default:
        throw new Error(`Unsupported step kind "${String(step.kind)}".`);
    }
  }
}

/// `export` step kind's formatter (task #283). Deliberately minimal —
/// `csv` only handles an array of flat objects (the common case: a list
/// of findings/results earlier in the run), falling back to a single
/// "value" column for anything else rather than throwing, since this
/// step is meant to produce something a downstream `notify`/
/// `webhook_call` step can send onward, not to be a general-purpose
/// data pipeline.
function formatExport(format: 'json' | 'csv' | 'markdown', data: unknown): string {
  if (format === 'json') return JSON.stringify(data, null, 2);

  const rows: Record<string, unknown>[] = Array.isArray(data)
    ? (data as unknown[]).map((item) => (item && typeof item === 'object' ? (item as Record<string, unknown>) : { value: item }))
    : [{ value: data }];
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];

  if (format === 'csv') {
    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = columns.map(escape).join(',');
    const body = rows.map((row) => columns.map((c) => escape(row[c])).join(',')).join('\n');
    return `${header}\n${body}`;
  }

  // markdown
  const header = `| ${columns.join(' | ')} |`;
  const divider = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${columns.map((c) => String(row[c] ?? '')).join(' | ')} |`).join('\n');
  return `${header}\n${divider}\n${body}`;
}
