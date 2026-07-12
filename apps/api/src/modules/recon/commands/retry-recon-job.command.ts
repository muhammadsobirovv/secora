import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import type { ReconJobDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  RECON_JOBS_REPOSITORY,
  type ReconJobsRepository,
} from '../domain/repositories/recon-jobs.repository.interface.js';
import { resolveReconJobForCaller } from './cancel-recon-job.command.js';
import { toReconJobDto } from '../mappers/to-recon-job-dto.mapper.js';

export class RetryReconJobCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly jobId: string,
  ) {}
}

@CommandHandler(RetryReconJobCommand)
export class RetryReconJobHandler implements ICommandHandler<
  RetryReconJobCommand,
  ReconJobDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(RECON_JOBS_REPOSITORY)
    private readonly reconJobsRepository: ReconJobsRepository,
  ) {}

  async execute(command: RetryReconJobCommand): Promise<ReconJobDto> {
    const { job } = await resolveReconJobForCaller(
      this.workspacesRepository,
      this.reconJobsRepository,
      command.userId,
      command.jobId,
    );

    const reset = await this.reconJobsRepository.resetForManualRetry(job.id);
    if (!reset) {
      throw new AppException(
        'RECON_JOB_NOT_RETRYABLE',
        'Only failed jobs can be retried.',
      );
    }

    const refreshed = await this.reconJobsRepository.findById(job.id);
    return toReconJobDto(refreshed!);
  