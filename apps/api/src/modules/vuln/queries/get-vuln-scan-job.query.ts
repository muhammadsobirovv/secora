import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import type { VulnScanJobDto } from '@pentesthub/shared';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  VULN_SCAN_JOBS_REPOSITORY,
  type VulnScanJobsRepository,
} from '../domain/repositories/vuln-scan-jobs.repository.interface.js';
import { resolveVulnScanJobForCaller } from '../commands/stop-vuln-scan-job.command.js';
import { toVulnScanJobDto } from '../mappers/to-vuln-scan-job-dto.mapper.js';

export class GetVulnScanJobQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly jobId: string,
  ) {}
}

@QueryHandler(GetVulnScanJobQuery)
export class GetVulnScanJobHandler implements IQueryHandler<
  GetVulnScanJobQuery,
  VulnScanJobDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(VULN_SCAN_JOBS_REPOSITORY)
    private readonly vulnScanJobsRepository: VulnScanJobsRepository,
  ) {}

  async execute(query: GetVulnScanJobQuery): Promise<VulnScanJobDto> {
    const { job } = await resolveVulnScanJobForCaller(
      this.workspacesRepository,
      this.vulnScanJobsRepository,
      query.userId,
      query.jobId,
    );
    return toVulnScanJobDto(job);
  }
}
