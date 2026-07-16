import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../common/exceptions/app.exception.js';
import type { WorkspacesRepository } from '../workspaces/domain/repositories/workspaces.repository.interface.js';
import type { BugBountyProgramsRepository } from './domain/repositories/bugbounty-programs.repository.interface.js';
import type { BugBountyFindingsRepository } from './domain/repositories/bugbounty-findings.repository.interface.js';
import type { BugReportsRepository } from './domain/repositories/bug-reports.repository.interface.js';
import type {
  BugBountyProgram,
  BugBountyFinding,
  BugReport,
} from '../../prisma-types.js';

/// Same enumeration-safe-404 shape as resolveTargetForCaller (Module 2)
/// and resolveAiConversationForCaller (Module 5): a program that doesn't
/// exist and one that belongs to another workspace both resolve to the
/// same BUGBOUNTY_PROGRAM_NOT_FOUND, so a caller can't probe for the
/// existence of another workspace's programs.
export async function resolveWorkspaceForCaller(
  workspacesRepository: WorkspacesRepository,
  userId: string,
): Promise<{ id: string }> {
  const workspace =
    await workspacesRepository.findPersonalWorkspaceForUser(userId);
  if (!workspace) {
    throw new AppException(
      'WORKSPACE_NOT_FOUND',
      'Workspace not found.',
      HttpStatus.NOT_FOUND,
    );
  }
  return workspace;
}

export async function resolveBugBountyProgramForCaller(
  workspacesRepository: WorkspacesRepository,
  programsRepository: BugBountyProgramsRepository,
  userId: string,
  programId: string,
): Promise<{ workspaceId: string; program: BugBountyProgram }> {
  const workspace = await resolveWorkspaceForCaller(
    workspacesRepository,
    userId,
  );
  const program = await programsRepository.findByIdForWorkspace(
    programId,
    workspace.id,
  );
  if (!program) {
    throw new AppException(
      'BUGBOUNTY_PROGRAM_NOT_FOUND',
      'Program not found.',
      HttpStatus.NOT_FOUND,
    );
  }
  return { workspaceId: workspace.id, program };
}

export async function resolveBugBountyFindingForCaller(
  workspacesRepository: WorkspacesRepository,
  findingsRepository: BugBountyFindingsRepository,
  userId: string,
  findingId: string,
): Promise<{ workspaceId: string; finding: BugBountyFinding }> {
  const workspace = await resolveWorkspaceForCaller(
    workspacesRepository,
    userId,
  );
  const finding = await findingsRepository.findByIdForWorkspace(
    findingId,
    workspace.id,
  );
  if (!finding) {
    throw new AppException(
      'BUGBOUNTY_FINDING_NOT_FOUND',
      'Finding not found.',
      HttpStatus.NOT_FOUND,
    );
  }
  return { workspaceId: workspace.id, finding };
}

export async function resolveBugReportForCaller(
  workspacesRepository: WorkspacesRepository,
  reportsRepository: BugReportsRepository,
  userId: string,
  reportId: string,
): Promise<{ workspaceId: string; report: BugReport }> {
  const workspace = await resolveWorkspaceForCaller(
    workspacesRepository,
    userId,
  );
  const report = await reportsRepository.findByIdForWorkspace(
    reportId,
    workspace.id,
  );
  if (!report) {
    throw new AppException(
      'BUG_REPORT_NOT_FOUND',
      'Report not found.',
      HttpStatus.NOT_FOUND,
    );
  }
  return { wo