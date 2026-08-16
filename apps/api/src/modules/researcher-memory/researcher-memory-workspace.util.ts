import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AppException } from '../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../workspaces/domain/repositories/workspaces.repository.interface.js';

/// Mirrors `ResearchSessionController`'s `resolveWorkspaceId` exactly —
/// AI Memory has no explicit workspace-switching concept in its shared
/// DTOs either (`CreateResearcherMemoryEntryRequestDto` carries no
/// `workspaceId` field), so the caller's own workspace is resolved
/// server-side via `WorkspacesRepository.findPersonalWorkspaceForUser`
/// rather than trusted from the client. A memory entry is additionally
/// scoped to `userId` (not just `workspaceId`) at the query/command
/// level — see researcher-memory.commands.ts — matching the spec's
/// "user-level permissions" requirement: workspace members don't
/// automatically see each other's researcher memory.
@Injectable()
export class ResearcherMemoryWorkspaceResolver {
  constructor(
    @Inject(WORKSPACES_REPOSITORY) private readonly workspacesRepository: WorkspacesRepository,
  ) {}

  async resolve(userId: string): Promise<string> {
    const workspace = await this.workspacesRepository.findPersonalWorkspaceForUser(userId);
    if (!workspace) {
      throw new AppException('WORKSPACE_NOT_FOUND', 'Workspace not found.', HttpStatus.NOT_FOUND);
    }
    return workspace.id;
  }
}
