import type {
  PlaybookApprovalDto,
  PlaybookDto,
  PlaybookExecutionDto,
  PlaybookExecutionStepDto,
  PlaybookGraph,
  PlaybookVariableDefinition,
  PlaybookVersionDto,
} from '@pentesthub/shared';
import type {
  Playbook,
  PlaybookApproval,
  PlaybookExecution,
  PlaybookExecutionStep,
  PlaybookVersion,
} from '../../../prisma-types.js';

export function toPlaybookDto(playbook: Playbook): PlaybookDto {
  return {
    id: playbook.id,
    workspaceId: playbook.workspaceId,
    name: playbook.name,
    description: playbook.description ?? null,
    category: playbook.category,
    isBuiltIn: playbook.isBuiltIn,
    status: playbook.status as PlaybookDto['status'],
    currentVersionId: playbook.currentVersionId ?? null,
    createdBy: playbook.createdBy,
    createdAt: playbook.createdAt.toISOString(),
    updatedAt: playbook.updatedAt.toISOString(),
    archivedAt: playbook.archivedAt ? playbook.archivedAt.toISOString() : null,
  };
}

export function toPlaybookVersionDto(version: PlaybookVersion): PlaybookVersionDto {
  return {
    id: version.id,
    playbookId: version.playbookId,
    version: version.version,
    graph: version.graph as unknown as PlaybookGraph,
    variables: (version.variables as unknown as PlaybookVariableDefinition[]) ?? [],
    publishedAt: version.publishedAt ? version.publishedAt.toISOString() : null,
    publishedBy: version.publishedBy ?? null,
    createdBy: version.createdBy,
    createdAt: version.createdAt.toISOString(),
  };
}

export function toPlaybookExecutionStepDto(step: PlaybookExecutionStep): PlaybookExecutionStepDto {
  return {
    id: step.id,
    nodeId: step.nodeId,
    stepType: step.stepType as PlaybookExecutionStepDto['stepType'],
    status: step.status as PlaybookExecutionStepDto['status'],
    input: step.input ?? null,
    output: step.output ?? null,
    error: step.error ?? null,
    reconJobId: step.reconJobId ?? null,
    vulnScanJobId: step.vulnScanJobId ?? null,
    adHocCommandId: step.adHocCommandId ?? null,
    approvalId: step.approvalId ?? null,
    startedAt: step.startedAt ? step.startedAt.toISOString() : null,
    finishedAt: step.finishedAt ? step.finishedAt.toISOString() : null,
  };
}

export function toPlaybookExecutionDto(execution: PlaybookExecution, steps: PlaybookExecutionStep[]): PlaybookExecutionDto {
  return {
    id: execution.id,
    workspaceId: execution.workspaceId,
    projectId: execution.projectId,
    playbookId: execution.playbookId,
    playbookVersionId: execution.playbookVersionId,
    targetId: execution.targetId,
    status: execution.status as PlaybookExecutionDto['status'],
    isDryRun: execution.isDryRun,
    variableValues: (execution.variableValues as Record<string, unknown>) ?? {},
    requestedBy: execution.requestedBy,
    error: execution.error ?? null,
    startedAt: execution.startedAt ? execution.startedAt.toISOString() : null,
    finishedAt: execution.finishedAt ? execution.finishedAt.toISOString() : null,
    createdAt: execution.createdAt.toISOString(),
    steps: steps.map(toPlaybookExecutionStepDto),
  };
}

export function toPlaybookApprovalDto(approval: PlaybookApproval): PlaybookApprovalDto {
  return {
    id: approval.id,
    executionId: approval.executionId,
    executionStepId: approval.executionStepId,
    status: approval.status as PlaybookApprovalDto['status'],
    securityApprovalRequestId: approval.securityApprovalRequestId ?? null,
    requestedBy: approval.requestedBy,
    decidedBy: approval.decidedBy ?? null,
    decidedAt: approval.decidedAt ? approval.decidedAt.toISOString() : null,
    expiresAt: approval.expiresAt ? approval.expiresAt.toISOString() : null,
    createdAt: approval.createdAt.toISOString(),
  };
}
