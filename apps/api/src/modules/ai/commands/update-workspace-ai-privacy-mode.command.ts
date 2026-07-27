import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus, Inject } from '@nestjs/common';
import type {
  UpdateWorkspaceAiPrivacyModeRequestDto,
  WorkspaceAiPrivacySettingDto,
} from '@pentesthub/shared';
import { AiPrivacyModeService } from '../providers/ai-privacy-mode.service.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../ai-authorization.util.js';
import { AppException } from '../../../common/exceptions/app.exception.js';

/// Module 11 — Privacy controls (task #234).
export class UpdateWorkspaceAiPrivacyModeCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly data: UpdateWorkspaceAiPrivacyModeRequestDto,
  ) {}
}

@CommandHandler(UpdateWorkspaceAiPrivacyModeCommand)
export class UpdateWorkspaceAiPrivacyModeHandler
  implements ICommandHandler<UpdateWorkspaceAiPrivacyModeCommand, WorkspaceAiPrivacySettingDto>
{
  constructor(
    private readonly privacyModeService: AiPrivacyModeService,
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
  ) {}

  async execute(
    command: UpdateWorkspaceAiPrivacyModeCommand,
  ): Promise<WorkspaceAiPrivacySettingDto> {
    const workspace = await this.workspacesRepository.findPersonalWorkspaceForUser(
      command.userId,
    );
    if (!workspace) {
      throw new AppException('WORKSPACE_NOT_FOUND', 'Workspace not found.', HttpStatus.NOT_FOUND);
    }
    return this.privacyModeService.setMode(workspace.id, command.data.mode);
  }
}
