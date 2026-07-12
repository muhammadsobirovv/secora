import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import type { ReconJobDto } from '@pentesthub/shared';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  RECON_JOBS_REPOSITORY,
  type ReconJobsRepository,
} from '../domain/repositories/recon-jobs.repository.interface.js';
import { resolveReconJobForCaller } from '../commands/cancel-recon-job.command.js';
import { toReconJobDto } from '../mappers/to-recon-job-dto.mapper.js';

export class GetReconJobQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly jobId: string,
  ) {}
}

@QueryHandler(GetReconJobQuery)
export class GetReconJobHandler implements IQueryHandler<
  GetReconJobQuery,
  ReconJobDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(RECON_JOBS_REPOSITORY)
    private readonly reconJobsRepository: ReconJobsRepository,
  ) {}

  async execute(query: GetReconJobQuery): Promise<ReconJobDto> {
    const { job } = await resolveReconJobForCaller(
      this.workspacesRepository,
      this.reconJobsRepository,
      query.userId,
      query.jobId,
    );
    return toReconJobDto(job);
  