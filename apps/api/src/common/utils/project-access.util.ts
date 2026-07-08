import { HttpStatus } from '@nestjs/common';
import { AppException } from '../exceptions/app.exception.js';
import type { WorkspacesRepository } from '../../modules/workspaces/domain/repositories/workspaces.repository.interface.js';
import type { ProjectsRepository } from '../../modules/projects/domain/repositories/projects.repository.interface.js';

/// Shared by Targets/Notes/Evidence (and anything else scoped under a
/// Project): resolve the caller's workspace, then the project within it,
/// throwing the same enumeration-safe 404s either way. A plain function
/// (not an injectable service) — no new module/DI surface, just removes
/// the duplicated two-hop lookup from every command/query handler.
export async function resolveProjectInCallerWorkspace(
  workspacesRepository: WorkspacesRepository,
  projectsRepository: ProjectsRepository,
  userId: string,
  projectId: string,
) {
  const workspace =
    await workspacesRepository.findPersonalWorkspaceForUser(userId);
  if (!workspace) {
    throw new AppException(
      'WORKSPACE_NOT_FOUND',
      'Workspace not found.',
      HttpStatus.NOT_FOUND,
    );
  }
  const project = await projectsRepository.findByIdForWorkspace(
    projectId,
    workspace.id,
  );
  if (!project) {
    throw new AppException(
      'PROJECT_NOT_FOUND',
      'Project not found.',
      HttpStatus.NOT_FOUND,
    );
  }
  return { workspace, project };
}
