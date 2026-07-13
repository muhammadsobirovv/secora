import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import type { ReconJobLogDto } from '@pentesthub/shared';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  RECON_JOBS_REPOSITORY,
  type ReconJobsRepository,
} from '../domain/repositories/recon-jobs.repository.interface.js';
import {
  RECON_JOB_LOGS_REPOSITORY,
  type ReconJobLogsRepository,
} from '../domain/repositories/recon-job-logs.repository.interface.js';
import { resolveReconJobForCaller } from '../commands/cancel-recon-job.command.js';
import { toReconJobLogDto } from '../mappers/to-recon-job-log-dto.mapper.js';

/// sinceSeq is a string on the wire (BigInt doesn't round-trip through
/// JSON) — parsed back to bigint here, at the query boundary. Called
/// repeatedly by the SSE controller's poll loop, not just once per
/// request, so the ownership check (resolveReconJobForCaller) running on
/// every tick is deliberate: cheap relative to the poll interval, and
/// means a job that becomes inaccessible mid-stream (e.g. deleted) stops
/// the stream instead of silently returning nothing forever.
export class ListReconJobLogsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly jobId: string,
    public readonly sinceSeq: string | null,
  ) {}
}

@QueryHandler(ListReconJobLogsQuery)
export class ListReconJobLogsHandler implements IQueryHandler<
  ListReconJobLogsQuery,
  ReconJobLogDto[]
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(RECON_JOBS_REPOSITORY)
    private readonly reconJobsRepository: ReconJobsRepository,
    @Inject(RECON_JOB_LOGS_REPOSITORY)
    private readonly reconJobLogsRepository: ReconJobLogsRepository,
  ) {}

  async execute(query: ListReconJobLogsQuery): Promise<ReconJobLogDto[]> {
    await resolveReconJobForCaller(
      this.workspacesRepository,
      this.reconJobsRepository,
      query.userId,
      query.jobId,
    );
    const logs = await this.reconJobLogsRepository.listSince(
      query.jobId,
      query.sinceSeq !== null ? BigInt(query.sinceSeq) : null,
    );
    return logs.map(toReconJobLogDto);
  }
}
