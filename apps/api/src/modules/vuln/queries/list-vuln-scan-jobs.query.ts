import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject, HttpStatus } from '@nestjs/common';
import type {
  ListVulnScanJobsQueryDto,
  VulnScanJobDto,
} from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  VULN_SCAN_JOBS_REPOSITORY,
  type VulnScanJobsRepository,
} from '../domain/repositories/vuln-scan-jobs.repository.interface.js';
import { toVulnScanJobDto } from '../mappers/to-vuln-scan-job-dto.mapper.js';

/// Unscoped (no projectId/targetId) returns every job across the caller's
/// workspace — powers the Vulnerability Dashboard's "Running Jobs" /
/// recent-scans views, same role as Recon's ListReconJobsQuery.
export class ListVulnScanJobsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly filter: ListVulnScanJobsQueryDto,
  ) {}
}

@QueryHandler(ListVulnScanJobsQuery)
export class ListVulnScanJobsHandler implements IQueryHandler<
  ListVulnScanJobsQuery,
  VulnScanJobDto[]
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(VULN_SCAN_JOBS_REPOSITORY)
    private readonly vulnScanJobsRepository: VulnScanJobsRepository,
  ) {}

  async execute(query: ListVulnScanJobsQuery): Promise<VulnScanJobDto[]> {
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
    const jobs = await this.vulnScanJobsRepository.list({
      workspaceId: workspace.id,
      projectId: query.filter.projectId,
      targetId: query.filter.targetId,
      status: query.filter.status,
      limit: query.filter.limit,
    });
    return jobs.map(toVulnScanJobDto);
  }
}
