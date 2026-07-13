import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import type { VulnScanJobDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  VULN_SCAN_JOBS_REPOSITORY,
  type VulnScanJobsRepository,
} from '../domain/repositories/vuln-scan-jobs.repository.interface.js';
import { resolveVulnScanJobForCaller } from './stop-vuln-scan-job.command.js';
import { toVulnScanJobDto } from '../mappers/to-vuln-scan-job-dto.mapper.js';

export class RetryVulnScanJobCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly jobId: string,
  ) {}
}

@CommandHandler(RetryVulnScanJobCommand)
export class RetryVulnScanJobHandler implements ICommandHandler<
  RetryVulnScanJobCommand,
  VulnScanJobDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(VULN_SCAN_JOBS_REPOSITORY)
    private readonly vulnScanJobsRepository: VulnScanJobsRepository,
  ) {}

  async execute(command: RetryVulnScanJobCommand): Promise<VulnScanJobDto> {
    const { job } = await resolveVulnScanJobForCaller(
      this.workspacesRepository,
      this.vulnScanJobsRepository,
      command.userId,
      command.jobId,
    );

    const reset = await this.vulnScanJobsRepository.resetForManualRetry(job.id);
    if (!reset) {
      throw new AppException(
        'VULN_SCAN_JOB_NOT_RETRYABLE',
        'Only failed jobs can be retried.',
      );
    }

    const refreshed = await this.vulnScanJobsRepository.findById(job.id);
    return toVulnScanJobDto(refreshed!);
  }
}
