import {
  CommandHandler,
  EventBus,
  ICommand,
  ICommandHandler,
} from '@nestjs/cqrs';
import { Inject, HttpStatus } from '@nestjs/common';
import type { VulnScanJobDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  VULN_SCAN_JOBS_REPOSITORY,
  type VulnScanJobsRepository,
  type VulnScanJobWithToolRuns,
} from '../domain/repositories/vuln-scan-jobs.repository.interface.js';
import { toVulnScanJobDto } from '../mappers/to-vuln-scan-job-dto.mapper.js';
import { VulnScanJobCancelledEvent } from '../events/vuln-scan-job-events.js';

/// Every Vuln command/query operating on a single job resolves it this
/// way — mirrors resolveReconJobForCaller (Module 3) exactly.
export async function resolveVulnScanJobForCaller(
  workspacesRepository: WorkspacesRepository,
  vulnScanJobsRepository: VulnScanJobsRepository,
  userId: string,
  jobId: string,
): Promise<{ workspaceId: string; job: VulnScanJobWithToolRuns }> {
  const workspace =
    await workspacesRepository.findPersonalWorkspaceForUser(userId);
  if (!workspace) {
    throw new AppException(
      'WORKSPACE_NOT_FOUND',
      'Workspace not found.',
      HttpStatus.NOT_FOUND,
    );
  }
  const job = await vulnScanJobsRepository.findByIdForWorkspace(
    jobId,
    workspace.id,
  );
  if (!job) {
    throw new AppException(
      'VULN_SCAN_JOB_NOT_FOUND',
      'Vulnerability scan job not found.',
      HttpStatus.NOT_FOUND,
    );
  }
  return { workspaceId: workspace.id, job };
}

/// "Stop Scan" (spec API section).
export class StopVulnScanJobCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly jobId: string,
  ) {}
}

@CommandHandler(StopVulnScanJobCommand)
export class StopVulnScanJobHandler implements ICommandHandler<
  StopVulnScanJobCommand,
  VulnScanJobDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(VULN_SCAN_JOBS_REPOSITORY)
    private readonly vulnScanJobsRepository: VulnScanJobsRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: StopVulnScanJobCommand): Promise<VulnScanJobDto> {
    const { workspaceId, job } = await resolveVulnScanJobForCaller(
      this.workspacesRepository,
      this.vulnScanJobsRepository,
      command.userId,
      command.jobId,
    );

    if (job.status === 'PENDING') {
      const cancelled = await this.vulnScanJobsRepository.cancelIfPending(
        job.id,
      );
      if (!cancelled) {
        throw new AppException(
          'VULN_SCAN_JOB_NOT_CANCELLABLE',
          'This job is no longer pending.',
        );
      }
      this.eventBus.publish(
        new VulnScanJobCancelledEvent(
          workspaceId,
          job.projectId,
          command.userId,
          job.id,
        ),
      );
    } else if (['RUNNING', 'RETRYING', 'PAUSED'].includes(job.status)) {
      const requested = await this.vulnScanJobsRepository.requestCancel(job.id);
      if (!requested) {
        throw new AppException(
          'VULN_SCAN_JOB_NOT_CANCELLABLE',
          'This job can no longer be cancelled.',
        );
      }
      // For RUNNING/RETRYING, the worker observes cancelRequestedAt and
      // performs the actual transition + publishes the event itself once
      // it stops (see VulnScanJobExecutionService). A PAUSED job has no
      // worker watching it, so requestCancel transitions it directly —
      // publish the event here in that case since nothing else will.
      if (job.status === 'PAUSED') {
        this.eventBus.publish(
          new VulnScanJobCancelledEvent(
            workspaceId,
            job.projectId,
            command.userId,
            job.id,
          ),
        );
      }
    } else {
      throw new AppException(
        'VULN_SCAN_JOB_NOT_CANCELLABLE',
        `Jobs in status ${job.status} cannot be cancelled.`,
      );
    }

    const refreshed = await this.vulnScanJobsRepository.findById(job.id);
    return toVulnScanJobDto(refreshed!);
  }
}
