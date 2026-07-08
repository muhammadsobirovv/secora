import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { Inject, HttpStatus } from '@nestjs/common';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  ATTACHMENTS_REPOSITORY,
  type AttachmentsRepository,
} from '../domain/repositories/attachments.repository.interface.js';

export class DeleteAttachmentCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly attachmentId: string,
  ) {}
}

@CommandHandler(DeleteAttachmentCommand)
export class DeleteAttachmentHandler implements ICommandHandler<
  DeleteAttachmentCommand,
  void
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(ATTACHMENTS_REPOSITORY)
    private readonly attachmentsRepository: AttachmentsRepository,
  ) {}

  async execute(command: DeleteAttachmentCommand): Promise<void> {
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
    const attachment = await this.attachmentsRepository.findById(
      command.attachmentId,
    );
    if (!attachment || attachment.workspaceId !== workspace.id) {
      throw new AppException(
        'ATTACHMENT_NOT_FOUND',
        'Attachment not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    await this.attachmentsRepository.softDelete(command.attachmentId);
  }
}
