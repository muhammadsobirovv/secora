import {
  CommandHandler,
  EventBus,
  ICommand,
  ICommandHandler,
} from '@nestjs/cqrs';
import { Inject, HttpStatus } from '@nestjs/common';
import type { ReconJobDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  RECON_JOBS_REPOSITORY,
  type ReconJobsRepository,
  type ReconJobWithToolRuns,
} from '../domain/repositories/recon-jobs.repository.interface.js';
import { toReconJobDto } from '../mappers/to-recon-job-dto.mapper.js';
import { ReconJobCancelledEvent } from '../events/recon-job-events.js';

/// Every Recon command/query that operates on a single job resolves it
/// this way: ReconJob already denormalizes workspaceId (see schema
/// comment), so this is a one-hop lookup, unlike Target's two-hop
/// workspace->project->target chain.
export async function resolveReconJobForCaller(
  workspacesRepository: WorkspacesRepository,
  reconJobsRepository: ReconJobsRepository,
  userId: string,
  jobId: string,
): Promise<{ workspaceId: string; job: ReconJobWithToolRuns }> {
  const workspace =
    await workspacesRepository.findPersonalWorkspaceForUser(userId);
  if (!workspace) {
    throw new AppException(
      'WORKSPACE_NOT_FOUND',
      'Workspace not found.',
      HttpStatus.NOT_FOUND,
    );
  }
  const job = await reconJobsRepository.findByIdForWorkspace(
    jobId,
    workspace.id,
  );
  if (!job) {
    throw new AppException(
      'RECON_JOB_NOT_FOUND',
      'Recon job not found.',
      HttpStatus.NOT_FOUND,
    );
  }
  return { workspaceId: workspace.id, job };
}

export class CancelReconJobCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly jobId: string,
  ) {}
}

@CommandHandler(CancelReconJobCommand)
export class CancelReconJobHandler implements ICommandHandler<
  CancelReconJobCommand,
  ReconJobDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(RECON_JOBS_REPOSITORY)
    private readonly reconJobsRepository: ReconJobsRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: CancelReconJobCommand): Promise<ReconJobDto> {
    const { workspaceId, job } = await resolveReconJobForCaller(
      this.workspacesRepository,
      this.reconJobsRepository,
      command.userId,
      command.jobId,
    );

    if (job.status === 'PENDING') {
      const cancelled = await this.reconJobsRepository.cancelIfPending(job.id);
      if (!cancelled) {
        throw new AppException(
          'RECON_JOB_NOT_CANCELLABLE',
          'This job is no longer pending.',
        );
      }
      this.eventBus.publish(
        new ReconJobCancelledEvent(
          workspaceId,
          job.projectId,
          command.userId,
          job.id,
        ),
      );
    } else if (job.status === 'RUNNING' || job.status === 'RETRYING') {
      const requested = await this.reconJobsRepository.requestCancel(job.id);
      if (!requested) {
        throw new AppException(
          'RECON_JOB_NOT_CANCELLABLE',
          'This job can no longer be cancelled.',
        );
      }
      // The worker observes cancelRequestedAt and performs the actual
      // status transition + publishes ReconJobCancelledEvent itself once
      // it stops — see ReconJobExecutionService.
    } else {
      throw new AppException(
        'RECON_JOB_NOT_CANCELLABLE',
        `Jobs in status ${job.status} cannot be cancelled.`,
      );
    }

    const refreshed = await this.reconJobsRepository.findById(job.id);
    return toReconJobDto(refreshed!);
  }
}
