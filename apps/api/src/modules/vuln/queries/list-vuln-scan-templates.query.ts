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

export class ListVulnScanTemplatesQuery implements IQuery {
  constructor(public readonly userId: string) {}
}

@QueryHandler(ListVulnScanTemplatesQuery)
export class ListVulnScanTemplatesHandler implements IQueryHandler<
  ListVulnScanTemplatesQuery,
  VulnScanTemplateDto[]
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(VULN_SCAN_TEMPLATES_REPOSITORY)
    private readonly vulnScanTemplatesRepository: VulnScanTemplatesRepository,
  ) {}

  async execute(
    query: ListVulnScanTemplatesQuery,
  ): Promise<VulnScanTemplateDto[]> {
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
    const templates = await this.vulnScanTemplatesRepository.list(workspace.id);
    return templates.map(toVulnScanTemplateDto);
  }
}
