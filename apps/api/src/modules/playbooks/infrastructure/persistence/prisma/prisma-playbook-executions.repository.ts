import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type {
  CreatePlaybookApprovalInput,
  CreatePlaybookExecutionInput,
  CreatePlaybookExecutionStepInput,
  DecidePlaybookApprovalInput,
  ListPlaybookExecutionsFilter,
  PlaybookExecutionsRepository,
  UpdatePlaybookExecutionInput,
  UpdatePlaybookExecutionStepInput,
} from '../../../domain/repositories/playbook-executions.repository.interface.js';
import type {
  PlaybookApproval,
  PlaybookExecution,
  PlaybookExecutionStep,
} from '../../../../../prisma-types.js';

@Injectable()
export class PrismaPlaybookExecutionsRepository implements PlaybookExecutionsRepository {
  constructor(private readonly txHost: TransactionHost<AppTransactionalAdapter>) {}

  createExecution(input: CreatePlaybookExecutionInput): Promise<PlaybookExecution> {
    return this.txHost.tx.playbookExecution.create({
      data: {
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        playbookId: input.playbookId,
        playbookVersionId: input.playbookVersionId,
        targetId: input.targetId,
        isDryRun: input.isDryRun,
        variableValues: input.variableValues as never,
        requestedBy: input.requestedBy,
      },
    });
  }

  findExecutionById(id: string): Promise<PlaybookExecution | null> {
    return this.txHost.tx.playbookExecution.findUnique({ where: { id } });
  }

  findExecutionByIdForWorkspace(id: string, workspaceId: string): Promise<PlaybookExecution | null> {
    return this.txHost.tx.playbookExecution.findFirst({ where: { id, workspaceId } });
  }

  listExecutions(filter: ListPlaybookExecutionsFilter): Promise<PlaybookExecution[]> {
    return this.txHost.tx.playbookExecution.findMany({
      where: {
        workspaceId: filter.workspaceId,
        ...(filter.playbookId ? { playbookId: filter.playbookId } : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 200,
    });
  }

  updateExecution(id: string, input: UpdatePlaybookExecutionInput): Promise<PlaybookExecution> {
    return this.txHost.tx.playbookExecution.update({
      where: { id },
      data: {
        ...(input.status !== undefined ? { status: input.status as never } : {}),
        ...(input.error !== undefined ? { error: input.error } : {}),
        ...(input.startedAt !== undefined ? { startedAt: input.startedAt } : {}),
        ...(input.finishedAt !== undefined ? { finishedAt: input.finishedAt } : {}),
      },
    });
  }

  createExecutionStep(input: CreatePlaybookExecutionStepInput): Promise<PlaybookExecutionStep> {
    return this.txHost.tx.playbookExecutionStep.create({
      data: {
        executionId: input.executionId,
        nodeId: input.nodeId,
        stepType: input.stepType,
        input: input.input as never,
      },
    });
  }

  updateExecutionStep(id: string, input: UpdatePlaybookExecutionStepInput): Promise<PlaybookExecutionStep> {
    return this.txHost.tx.playbookExecutionStep.update({
      where: { id },
      data: {
        ...(input.status !== undefined ? { status: input.status as never } : {}),
        ...(input.output !== undefined ? { output: input.output as never } : {}),
        ...(input.error !== undefined ? { error: input.error } : {}),
        ...(input.reconJobId !== undefined ? { reconJobId: input.reconJobId } : {}),
        ...(input.vulnScanJobId !== undefined ? { vulnScanJobId: input.vulnScanJobId } : {}),
        ...(input.adHocCommandId !== undefined ? { adHocCommandId: input.adHocCommandId } : {}),
        ...(input.approvalId !== undefined ? { approvalId: input.approvalId } : {}),
        ...(input.startedAt !== undefined ? { startedAt: input.startedAt } : {}),
        ...(input.finishedAt !== undefined ? { finishedAt: input.finishedAt } : {}),
      },
    });
  }

  findExecutionStepById(id: string): Promise<PlaybookExecutionStep | null> {
    return this.txHost.tx.playbookExecutionStep.findUnique({ where: { id } });
  }

  listExecutionSteps(executionId: string): Promise<PlaybookExecutionStep[]> {
    return this.txHost.tx.playbookExecutionStep.findMany({
      where: { executionId },
      orderBy: [{ createdAt: 'asc' }],
    });
  }

  createApproval(input: CreatePlaybookApprovalInput): Promise<PlaybookApproval> {
    return this.txHost.tx.playbookApproval.create({
      data: {
        executionId: input.executionId,
        executionStepId: input.executionStepId,
        workspaceId: input.workspaceId,
        requestedBy: input.requestedBy,
        securityApprovalRequestId: input.securityApprovalRequestId ?? null,
        expiresAt: input.expiresAt ?? null,
      },
    });
  }

  findApprovalById(id: string): Promise<PlaybookApproval | null> {
    return this.txHost.tx.playbookApproval.findUnique({ where: { id } });
  }

  findApprovalByIdForWorkspace(id: string, workspaceId: string): Promise<PlaybookApproval | null> {
    return this.txHost.tx.playbookApproval.findFirst({ where: { id, workspaceId } });
  }

  listApprovalsForWorkspace(workspaceId: string): Promise<PlaybookApproval[]> {
    return this.txHost.tx.playbookApproval.findMany({
      where: { workspaceId },
      orderBy: [{ createdAt: 'desc' }],
      take: 200,
    });
  }

  decideApproval(id: string, input: DecidePlaybookApprovalInput): Promise<PlaybookApproval> {
    return this.txHost.tx.playbookApproval.update({
      where: { id },
      data: {
        status: input.status as never,
        decidedBy: input.decidedBy,
        decidedAt: input.decidedAt,
      },
    });
  }
}
