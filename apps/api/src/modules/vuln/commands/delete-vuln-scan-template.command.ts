import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { Inject, HttpStatus } from '@nestjs/common';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  VULN_SCAN_TEMPLATES_REPOSITORY,
  type VulnScanTemplatesRepository,
} from '../domain/repositories/vuln-scan-templates.repository.interface.js';

export class DeleteVulnScanTemplateCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly templateId: string,
  ) {}
}

@CommandHandler(DeleteVulnScanTemplateCommand)
export class DeleteVulnScanTemplateHandler implements ICommandHandler<
  DeleteVulnScanTemplateCommand,
  void
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(VULN_SCAN_TEMPLATES_REPOSITORY)
    private readonly vulnScanTemplatesRepository: VulnScanTemplatesRepository,
  ) {}

  async execute(command: DeleteVulnScanTemplateCommand): Promise<void> {
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

    const deleted = await this.vulnScanTemplatesRepository.deleteIfNotBuiltIn(
      command.templateId,
      workspace.id,
    );
    if (!deleted) {
      throw new AppException(
        'VULN_SCAN_TEMPLATE_NOT_FOUND',
        'Scan template not found or cannot be deleted.',
        HttpStatus.NOT_FOUND,
      );
    }
  }
}
