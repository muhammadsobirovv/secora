import {
  CommandHandler,
  EventBus,
  ICommand,
  ICommandHandler,
} from '@nestjs/cqrs';
import { Inject, HttpStatus } from '@nestjs/common';
import type { WorkspaceDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { STORAGE_SERVICE } from '../../../common/providers/tokens.js';
import type { StorageService } from '../../../common/providers/storage/storage-service.interface.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../domain/repositories/workspaces.repository.interface.js';
import { toWorkspaceDto } from '../mappers/to-workspace-dto.mapper.js';
import { WorkspaceUpdatedEvent } from '../events/workspace-updated.event.js';

export class UploadWorkspaceAvatarCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly fileBuffer: Buffer,
    public readonly mimeType: string,
  ) {}
}

@CommandHandler(UploadWorkspaceAvatarCommand)
export class UploadWorkspaceAvatarHandler implements ICommandHandler<
  UploadWorkspaceAvatarCommand,
  WorkspaceDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(STORAGE_SERVICE)
    private readonly storageService: StorageService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: UploadWorkspaceAvatarCommand): Promise<WorkspaceDto> {
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

    const extension = command.mimeType.split('/')[1] ?? 'bin';
    const key = `workspaces/${workspace.id}/avatar.${extension}`;
    const { url } = await this.storageService.upload(
      key,
      command.fileBuffer,
      command.mimeType,
    );

    const updated = await this.workspacesRepository.update(workspace.id, {
      avatarUrl: url,
    });

    this.eventBus.publish(
      new WorkspaceUpdatedEvent(updated.id, command.userId, updated.id),
    );

    return toWorkspaceDto(updated);
  }
}
