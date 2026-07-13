import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { Inject, HttpStatus } from '@nestjs/common';
import type {
  CreateVulnScanTemplateRequestDto,
  VulnScanTemplateDto,
} from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  VULN_SCAN_TEMPLATES_REPOSITORY,
  type VulnScanTemplatesRepository,
} from '../domain/repositories/vuln-scan-templates.repository.interface.js';
import { toVulnScanTemplateDto } from '../mappers/to-vuln-scan-template-dto.mapper.js';

export class CreateVulnScanTemplateCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly data: CreateVulnScanTemplateRequestDto,
  ) {}
}

@CommandHandler(CreateVulnScanTemplateCommand)
export class CreateVulnScanTemplateHandler implements ICommandHandler<
  CreateVulnScanTemplateCommand,
  VulnScanTemplateDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(VULN_SCAN_TEMPLATES_REPOSITORY)
    private readonly vulnScanTemplatesRepository: VulnScanTemplatesRepository,
  ) {}

  async execute(
    command: CreateVulnScanTemplateCommand,
  ): Promise<VulnScanTemplateDto> {
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

    const template = await this.vulnScanTemplatesRepository.create({
      workspaceId: workspace.id,
      name: command.data.name,
      description: command.data.description ?? null,
      scanners: command.data.scanners,
      config: command.data.config ?? null,
      createdBy: command.userId,
    });

    return toVulnScanTemplateDto(template);
  }
}
