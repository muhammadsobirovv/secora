import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { HttpStatus, Inject } from '@nestjs/common';
import type { WorkspaceAiPrivacySettingDto } from '@pentesthub/shared';
import { AiPrivacyModeService } from '../providers/ai-privacy-mode.service.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../ai-authorization.util.js';
import { AppException } from '../../../common/exceptions/app.exception.js';

/// Module 11 — Privacy controls (task #234).
export class GetWorkspaceAiPrivacyModeQuery implements IQuery {
  constructor(public readonly userId: string) {}
}

@QueryHandler(GetWorkspaceAiPrivacyModeQuery)
export class GetWorkspaceAiPrivacyModeHandler
  implements IQueryHandler<GetWorkspaceAiPrivacyModeQuery, WorkspaceAiPrivacySettingDto>
{
  constructor(
    private readonly privacyModeService: AiPrivacyModeService,
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
  ) {}

  async execute(
    query: GetWorkspaceAiPrivacyModeQuery,
  ): Promise<WorkspaceAiPrivacySettingDto> {
    const workspace = await this.workspacesRepository.findPersonalWorkspaceForUser(
      query.userId,
    );
    if (!workspace) {
      throw new AppException('WORKSPACE_NOT_FOUND', 'Workspace not found.', HttpStatus.NOT_FOUND);
    }
    return this.privacyModeService.getSetting(workspace.id);
  }
}
