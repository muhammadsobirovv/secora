import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../common/exceptions/app.exception.js';
import type {
  AgentOrchestrationRepository,
  OrchestrationRunRecord,
} from './domain/repositories/agent-orchestration.repository.interface.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../workspaces/domain/repositories/workspaces.repository.interface.js';

/// Same enumeration-safe-404 "resolve + authorize" pattern as
/// resolveAiConversationForCaller (Module 5)/resolveVulnScanJobForCaller
/// (Module 4): an orchestration run that doesn't exist and one that
/// belongs to another workspace both resolve to the same NOT_FOUND, so a
/// caller can't probe for another workspace's runs (Security: Workspace
/// Isolation).
export async function resolveOrchestrationRunForCaller(
  repository: AgentOrchestrationRepository,
  workspacesRepository: WorkspacesRepository,
  userId: string,
  orchestrationRunId: string,
): Promise<OrchestrationRunRecord> {
  const workspace = await workspacesRepository.findPersonalWorkspaceForUser(userId);
  if (!workspace) {
    throw new AppException('WORKSPACE_NOT_FOUND', 'Workspace not found.', HttpStatus.NOT_FOUND);
  }
  const run = await repository.findRunById(orchestrationRunId);
  if (!run || run.workspaceId !== workspace.id) {
    throw new AppException(
      'ORCHESTRATION_RUN_NOT_FOUND',
      'Orchestration run not found.',
      HttpStatus.NOT_FOUND,
    );
  }
  return run;
}

export async function resolveWorkspaceForCaller(
  workspacesRepository: WorkspacesRepository,
  userId: string,
): Promise<{ id: string }> {
  const workspace = await workspacesRepository.findPersonalWorkspaceForUser(userId);
  if (!workspace) {
    throw new AppException('WORKSPACE_NOT_FOUND', 'Workspace not found.', HttpStatus.NOT_FOUND);
  }
  return workspace;
}

export { WORKSPACES_REPOSITORY, type WorkspacesRepository };
