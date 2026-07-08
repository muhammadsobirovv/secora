import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { Inject, HttpStatus } from '@nestjs/common';
import type { WorkspaceSettingsDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../domain/repositories/workspaces.repository.interface.js';
import {
  WORKSPACE_SETTINGS_REPOSITORY,
  type WorkspaceSettingsRepository,
} from '../domain/repositories/workspace-settings.repository.interface.js';
import type { ProjectStatus } from '../../../prisma-types.js';

export class UpdateWorkspaceSettingsCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly data: { defaultProjectStatus?: ProjectStatus },
  ) {}
}

@CommandHandler(UpdateWorkspaceSettingsCommand)
export class UpdateWorkspaceSettingsHandler implements ICommandHandler<
  UpdateWorkspaceSettingsCommand,
  WorkspaceSettingsDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(WORKSPACE_SETTINGS_REPOSITORY)
    private readonly settingsRepository: WorkspaceSettingsRepository,
  ) {}

  async execute(
    command: UpdateWorkspaceSettingsCommand,
  ): Promise<WorkspaceSettingsDto> {
    const workspace =
      await this.workspacesRepository.findPersonalWorkspaceForUser(
        command.userId,
      );
    if (!workspace) {
      throw new AppException(
        'WORKSPACE_NOT_FOUND',
        'Workspace not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    const existing = await this.settingsRepository.findByWorkspaceId(
      workspace.id,
    );
    const updated = existing
      ? await this.settingsRepository.update(workspace.id, command.data)
      : await this.settingsRepository.createDefault(workspace.id);

    return { defaultProjectStatus: updated.defaultProjectStatus };
  }
}
