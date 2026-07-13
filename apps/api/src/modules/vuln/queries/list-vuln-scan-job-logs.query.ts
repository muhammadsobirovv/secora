import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import type { VulnScanJobLogDto } from '@pentesthub/shared';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  VULN_SCAN_JOBS_REPOSITORY,
  type VulnScanJobsRepository,
} from '../domain/repositories/vuln-scan-jobs.repository.interface.js';
import {
  VULN_SCAN_JOB_LOGS_REPOSITORY,
  type VulnScanJobLogsRepository,
} from '../domain/repositories/vuln-scan-job-logs.repository.interface.js';
import { resolveVulnScanJobForCaller } from '../commands/stop-vuln-scan-job.command.js';
import { toVulnScanJobLogDto } from '../mappers/to-vuln-scan-job-log-dto.mapper.js';

/// sinceSeq is a string on the wire (BigInt doesn't round-trip through
/// JSON) — same convention as Recon's ListReconJobLogsQuery.
export class ListVulnScanJobLogsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly jobId: string,
    public readonly sinceSeq: string | null,
  ) {}
}

@QueryHandler(ListVulnScanJobLogsQuery)
export class ListVulnScanJobLogsHandler implements IQueryHandler<
  ListVulnScanJobLogsQuery,
  VulnScanJobLogDto[]
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(VULN_SCAN_JOBS_REPOSITORY)
    private readonly vulnScanJobsRepository: VulnScanJobsRepository,
    @Inject(VULN_SCAN_JOB_LOGS_REPOSITORY)
    private readonly vulnScanJobLogsRepository: VulnScanJobLogsRepository,
  ) {}

  async execute(query: ListVulnScanJobLogsQuery): Promise<VulnScanJobLogDto[]> {
    await resolveVulnScanJobForCaller(
      this.workspacesRepository,
      this.vulnScanJobsRepository,
      query.userId,
      query.jobId,
    );
    const logs = await this.vulnScanJobLogsRepository.listSince(
      query.jobId,
      query.sinceSeq !== null ? BigInt(query.sinceSeq) : null,
    );
    return logs.map(toVulnScanJobLogDto);
  }
}
