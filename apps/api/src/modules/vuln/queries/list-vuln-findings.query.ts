import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject, HttpStatus } from '@nestjs/common';
import type {
  ListVulnFindingsQueryDto,
  VulnFindingDto,
} from '@pentesthub/shared';
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

/// Backs both the flat Findings page (search/filters) and any
/// target/job-scoped findings list — same query, different filter
/// combination, matching Recon's ListReconFindingsQuery.
export class ListVulnFindingsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly filter: ListVulnFindingsQueryDto,
  ) {}
}

@QueryHandler(ListVulnFindingsQuery)
export class ListVulnFindingsHandler implements IQueryHandler<
  ListVulnFindingsQuery,
  VulnFindingDto[]
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(VULN_FINDINGS_REPOSITORY)
    private readonly vulnFindingsRepository: VulnFindingsRepository,
  ) {}

  async execute(query: ListVulnFindingsQuery): Promise<VulnFindingDto[]> {
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
    const findings = await this.vulnFindingsRepository.list({
      workspaceId: workspace.id,
      targetId: query.filter.targetId,
      projectId: query.filter.projectId,
      jobId: query.filter.jobId,
      severity: query.filter.severity,
      status: query.filter.status,
      scanner: query.filter.scanner,
      search: query.filter.search,
      limit: query.filter.limit,
    });
    return findings.map(toVulnFindingDto);
  }
}
