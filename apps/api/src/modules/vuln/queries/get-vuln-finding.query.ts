import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject, HttpStatus } from '@nestjs/common';
import type { VulnFindingDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  VULN_FINDINGS_REPOSITORY,
  type VulnFindingsRepository,
} from '../domain/repositories/vuln-findings.repository.interface.js';
import { toVulnFindingDto } from '../mappers/to-vuln-finding-dto.mapper.js';

export class GetVulnFindingQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly findingId: string,
  ) {}
}

@QueryHandler(GetVulnFindingQuery)
export class GetVulnFindingHandler implements IQueryHandler<
  GetVulnFindingQuery,
  VulnFindingDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(VULN_FINDINGS_REPOSITORY)
    private readonly vulnFindingsRepository: VulnFindingsRepository,
  ) {}

  async execute(query: GetVulnFindingQuery): Promise<VulnFindingDto> {
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
    const finding = await this.vulnFindingsRepository.findByIdForWorkspace(
      query.findingId,
      workspace.id,
    );
    if (!finding) {
      throw new AppException(
        'VULN_FINDING_NOT_FOUND',
        'Finding not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    return toVulnFindingDto(finding);
  }
}
