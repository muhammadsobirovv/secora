import {
  CommandHandler,
  EventBus,
  ICommand,
  ICommandHandler,
} from '@nestjs/cqrs';
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
import { VulnScanJobResumedEvent } from '../events/vuln-scan-job-events.js';

/// "Resume Scan" (spec API section). PAUSED -> PENDING; the poller picks
/// it back up on its next tick like any other pending job — the
/// already-completed tool runs are skipped (VulnScanJobExecutionService
/// only runs PENDING toolRuns), so this resumes from where it left off,
/// not from scratch.
export class ResumeVulnScanJobCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly jobId: string,
  ) {}
}

@CommandHandler(ResumeVulnScanJobCommand)
export class ResumeVulnScanJobHandler implements ICommandHandler<
  ResumeVulnScanJobCommand,
  VulnScanJobDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(VULN_SCAN_JOBS_REPOSITORY)
    private readonly vulnScanJobsRepository: VulnScanJobsRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: ResumeVulnScanJobCommand): Promise<VulnScanJobDto> {
    const { workspaceId, job } = await resolveVulnScanJobForCaller(
      this.workspacesRepository,
      this.vulnScanJobsRepository,
      command.userId,
      command.jobId,
    );

    const resumed = await this.vulnScanJobsRepository.resumeIfPaused(job.id);
    if (!resumed) {
      throw new AppException(
        'VULN_SCAN_JOB_NOT_RESUMABLE',
        'Only paused jobs can be resumed.',
      );
    }

    this.eventBus.publish(
      new VulnScanJobResumedEvent(
        workspaceId,
        job.projectId,
        command.userId,
        job.id,
      ),
    );

    const refreshed = await this.vulnScanJobsRepository.findById(job.id);
    return toVulnScanJobDto(refreshed!);
  }
}
