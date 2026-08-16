import type {
  PlaybookApproval,
  PlaybookExecution,
  PlaybookExecutionStep,
} from '../../../../prisma-types.js';

export interface CreatePlaybookExecutionInput {
  workspaceId: string;
  projectId: string;
  playbookId: string;
  playbookVersionId: string;
  targetId: string;
  isDryRun: boolean;
  variableValues: Record<string, unknown>;
  requestedBy: string;
}

export interface UpdatePlaybookExecutionInput {
  status?: string;
  error?: string | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
}

export interface ListPlaybookExecutionsFilter {
  workspaceId: string;
  playbookId?: string;
}

export interface CreatePlaybookExecutionStepInput {
  executionId: string;
  nodeId: string;
  stepType: string;
  input: unknown;
}

export interface UpdatePlaybookExecutionStepInput {
  status?: string;
  output?: unknown;
  error?: string | null;
  reconJobId?: string | null;
  vulnScanJobId?: string | null;
  adHocCommandId?: string | null;
  approvalId?: string | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
}

export interface CreatePlaybookApprovalInput {
  executionId: string;
  executionStepId: string;
  workspaceId: string;
  requestedBy: string;
  securityApprovalRequestId?: string | null;
  expiresAt?: Date | null;
}

export interface DecidePlaybookApprovalInput {
  status: 'APPROVED' | 'REJECTED' | 'EXPIRED';
  decidedBy: string | null;
  decidedAt: Date;
}

export interface PlaybookExecutionsRepository {
  createExecution(input: CreatePlaybookExecutionInput): Promise<PlaybookExecution>;
  findExecutionById(id: string): Promise<PlaybookExecution | null>;
  findExecutionByIdForWorkspace(id: string, workspaceId: string): Promise<PlaybookExecution | null>;
  listExecutions(filter: ListPlaybookExecutionsFilter): Promise<PlaybookExecution[]>;
  updateExecution(id: string, input: UpdatePlaybookExecutionInput): Promise<PlaybookExecution>;

  createExecutionStep(input: CreatePlaybookExecutionStepInput): Promise<PlaybookExecutionStep>;
  updateExecutionStep(id: string, input: UpdatePlaybookExecutionStepInput): Promise<PlaybookExecutionStep>;
  findExecutionStepById(id: string): Promise<PlaybookExecutionStep | null>;
  listExecutionSteps(executionId: string): Promise<PlaybookExecutionStep[]>;

  createApproval(input: CreatePlaybookApprovalInput): Promise<PlaybookApproval>;
  findApprovalById(id: string): Promise<PlaybookApproval | null>;
  findApprovalByIdForWorkspace(id: string, workspaceId: string): Promise<PlaybookApproval | null>;
  listApprovalsForWorkspace(workspaceId: string): Promise<PlaybookApproval[]>;
  decideApproval(id: string, input: DecidePlaybookApprovalInput): Promise<PlaybookApproval>;
}

export const PLAYBOOK_EXECUTIONS_REPOSITORY = Symbol('PLAYBOOK_EXECUTIONS_REPOSITORY');
