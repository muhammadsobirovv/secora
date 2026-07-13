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

/// Only records intent — the worker observes pauseRequestedAt and
/// transitions the job to PAUSED itself once it finishes the currently
/// running scanner (graceful, unlike Stop). See
/// VulnScanJobExecutionService and VulnScanJobPausedEvent.
export class PauseVulnScanJobCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly jobId: string,
  ) {}
}

@CommandHandler(PauseVulnScanJobCommand)
export class PauseVulnScanJobHandler implements ICommandHandler<
  PauseVulnScanJobCommand,
  VulnScanJobDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(VULN_SCAN_JOBS_REPOSITORY)
    private readonly vulnScanJobsRepository: VulnScanJobsRepository,
  ) {}

  async execute(command: PauseVulnScanJobCommand): Promise<VulnScanJobDto> {
    const { job } = await resolveVulnScanJobForCaller(
      this.workspacesRepository,
      this.vulnScanJobsRepository,
      command.userId,
      command.jobId,
    );

    const requested = await this.vulnScanJobsRepository.requestPause(job.id);
    if (!requested) {
      throw new AppException(
        'VULN_SCAN_JOB_NOT_PAUSABLE',
        `Jobs in status ${job.status} cannot be paused.`,
      );
    }

    const refreshed = await this.vulnScanJobsRepository.findById(job.id);
    return toVulnScanJobDto(refreshed!);
  }
}
