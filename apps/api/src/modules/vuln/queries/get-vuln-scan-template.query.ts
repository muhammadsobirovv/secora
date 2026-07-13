import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject, HttpStatus } from '@nestjs/common';
import type { VulnScanTemplateDto } from '@pentesthub/shared';
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

export class GetVulnScanTemplateQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly templateId: string,
  ) {}
}

@QueryHandler(GetVulnScanTemplateQuery)
export class GetVulnScanTemplateHandler implements IQueryHandler<
  GetVulnScanTemplateQuery,
  VulnScanTemplateDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(VULN_SCAN_TEMPLATES_REPOSITORY)
    private readonly vulnScanTemplatesRepository: VulnScanTemplatesRepository,
  ) {}

  async execute(query: GetVulnScanTemplateQuery): Promise<VulnScanTemplateDto> {
    const workspace =
      await this.workspacesRepository.findPersonalWorkspaceForUser(
        query.userId,
      );
    if (!workspace) {
      throw new AppException(
        'WORKSPACE_NOT_FOUND',
        'Workspace not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    const template =
      await this.vulnScanTemplatesRepository.findByIdForWorkspace(
        query.templateId,
        workspace.id,
      );
    if (!template) {
      throw new AppException(
        'VULN_SCAN_TEMPLATE_NOT_FOUND',
        'Scan template not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    return toVulnScanTemplateDto(template);
  }
}
