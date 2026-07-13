import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject, HttpStatus } from '@nestjs/common';
import type { ListReconJobsQueryDto, ReconJobDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  RECON_JOBS_REPOSITORY,
  type ReconJobsRepository,
} from '../domain/repositories/recon-jobs.repository.interface.js';
import { toReconJobDto } from '../mappers/to-recon-job-dto.mapper.js';

/// Unscoped (no projectId/targetId) returns every job across the caller's
/// workspace — this is what powers the dashboard "Recent Scans" widget
/// and the top-level /recon page, since (unlike Targets/Notes/Evidence)
/// Recon jobs have real cross-project dashboard value.
export class ListReconJobsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly filter: ListReconJobsQueryDto,
  ) {}
}

@QueryHandler(ListReconJobsQuery)
export class ListReconJobsHandler implements IQueryHandler<
  ListReconJobsQuery,
  ReconJobDto[]
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(RECON_JOBS_REPOSITORY)
    private readonly reconJobsRepository: ReconJobsRepository,
  ) {}

  async execute(query: ListReconJobsQuery): Promise<ReconJobDto[]> {
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
    const jobs = await this.reconJobsRepository.list({
      workspaceId: workspace.id,
      projectId: query.filter.projectId,
      targetId: query.filter.targetId,
      status: query.filter.status,
      limit: query.filter.limit,
    });
    return jobs.map(toReconJobDto);
  }
}
