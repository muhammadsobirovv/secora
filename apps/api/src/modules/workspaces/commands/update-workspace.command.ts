import {
  CommandHandler,
  EventBus,
  ICommand,
  ICommandHandler,
} from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import type { WorkspaceDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../domain/repositories/workspaces.repository.interface.js';
import { toWorkspaceDto } from '../mappers/to-workspace-dto.mapper.js';
import { WorkspaceUpdatedEvent } from '../events/workspace-updated.event.js';

export class UpdateWorkspaceCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly data: { name?: string; description?: string },
  ) {}
}

@CommandHandler(UpdateWorkspaceCommand)
export class UpdateWorkspaceHandler implements ICommandHandler<
  UpdateWorkspaceCommand,
  WorkspaceDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: UpdateWorkspaceCommand): Promise<WorkspaceDto> {
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

    const updated = await this.workspacesRepository.update(
      workspace.id,
      command.data,
    );

    this.eventBus.publish(
      new WorkspaceUpdatedEvent(updated.id, command.userId, updated.id),
    );

    return toWorkspaceDto(updated);
  }
}
