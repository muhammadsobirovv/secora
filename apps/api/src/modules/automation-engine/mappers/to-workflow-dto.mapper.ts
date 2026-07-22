import type { WorkflowDefinition, WorkflowDto, WorkflowRunDto, WorkflowStepLogDto } from '@pentesthub/shared';
import type { Workflow, WorkflowRun, WorkflowStepLog } from '../../../prisma-types.js';

export function toWorkflowDto(workflow: Workflow): WorkflowDto {
  return {
    id: workflow.id,
    organizationId: workflow.organizationId,
    workspaceId: workflow.workspaceId,
    name: workflow.name,
    description: workflow.description,
    definition: workflow.definitionJson as unknown as WorkflowDefinition,
    triggerType: workflow.triggerType,
    cronExpression: workflow.cronExpression,
    nextRunAt: workflow.nextRunAt ? workflow.nextRunAt.toISOString() : null,
    enabled: workflow.enabled,
    createdBy: workflow.createdBy,
    createdAt: workflow.createdAt.toISOString(),
    updatedAt: workflow.updatedAt.toISOString(),
  };
}

export function toWorkflowStepLogDto(log: WorkflowStepLog): WorkflowStepLogDto {
  return {
    id: log.id,
    workflowRunId: log.workflowRunId,
    stepKey: log.stepKey,
    status: log.status,
    message: log.message,
    startedAt: log.startedAt.toISOString(),
    finishedAt: log.finishedAt ? log.finishedAt.toISOString() : null,
  };
}

export function toWorkflowRunDto(run: WorkflowRun & { steps?: WorkflowStepLog[] }): WorkflowRunDto {
  return {
    id: run.id,
    workflowId: run.workflowId,
    status: run.status,
    triggeredBy: run.triggeredBy,
    input: run.input,
    output: run.output,
    error: run.error,
    pausedAtStepKey: run.pausedAtStepKey,
    resumeAt: run.resumeAt ? run.resumeAt.toISOString() : null,
    startedAt: run.startedAt ? run.startedAt.toISOString() : null,
    finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
    createdAt: run.createdAt.toISOString(),
    steps: run.steps ? run.steps.map(toWorkflowStepLogDto) : undefined,
  };
}
