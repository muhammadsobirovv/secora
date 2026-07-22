import { Injectable, Logger } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import type { WorkflowConditionOperator, WorkflowDefinition, WorkflowStepDefinition } from '@pentesthub/shared';
import type { Prisma } from '../../../prisma-types.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { ExecuteIntegrationActionCommand } from '../../integrations/commands/integration-actions.commands.js';
import { AiProviderRegistryService } from '../../ai/providers/ai-provider-registry.service.js';
import { collectStreamedCompletion } from '../../ai/providers/collect-stream.util.js';
import { NotificationDispatcherService } from '../../notifications-channels/services/notification-dispatcher.service.js';
import { ReportContentBuilderService } from '../../enterprise-reporting/report-content-builder.service.js';
import { getByPath, evaluateCondition } from '../workflow-context.util.js';
import { withSpan } from '../../../observability/tracing.js';
import { MetricsRegistryService } from '../../observability/metrics-registry.service.js';

interface StepResult {
  output?: unknown;
  message?: string;
  pause?: boolean;
  resumeAt?: Date;
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
    private readonly providerRegistry: AiProviderRegistryService,
    private readonly notificationDispatcher: NotificationDispatcherService,
    private readonly reportContentBuilder: ReportContentBuilderService,
    private readonly metrics: MetricsRegistryService,
  ) {}

  async start(runId: string): Promise<void> {
    const run = await this.prisma.workflowRun.findUniqueOrThrow({ where: { id: runId }, include: { workflow: true } });
    const definition = run.workflow.definitionJson as unknown as WorkflowDefinition;
    await this.prisma.workflowRun.update({
      where: { id: runId },
      data: { status: 'RUNNING', startedAt: new Date(), contextJson: (run.input as Prisma.InputJsonValue) ?? {} },
    });
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

      default:
        throw new Error(`Unsupported step kind "${String(step.kind)}".`);
    }
  }
}
