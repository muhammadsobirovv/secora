import {
  CommandHandler,
  EventBus,
  ICommand,
  ICommandHandler,
} from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CreateReconJobRequestDto, ReconJobDto } from '@pentesthub/shared';
import type { EnvConfig } from '../../../config/env.validation.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  PROJECTS_REPOSITORY,
  type ProjectsRepository,
} from '../../projects/domain/repositories/projects.repository.interface.js';
import {
  TARGETS_REPOSITORY,
  type TargetsRepository,
} from '../../targets/domain/repositories/targets.repository.interface.js';
import { resolveTargetForCaller } from '../../targets/commands/target-lifecycle.commands.js';
import {
  RECON_JOBS_REPOSITORY,
  type ReconJobsRepository,
} from '../domain/repositories/recon-jobs.repository.interface.js';
import { isToolCompatibleWithTargetType } from '../tool-runners/tool-target-compatibility.js';
import { toReconJobDto } from '../mappers/to-recon-job-dto.mapper.js';
import { ReconJobCreatedEvent } from '../events/recon-job-events.js';

export class CreateReconJobCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly targetId: string,
    public readonly data: CreateReconJobRequestDto,
  ) {}
}

@CommandHandler(CreateReconJobCommand)
export class CreateReconJobHandler implements ICommandHandler<
  CreateReconJobCommand,
  ReconJobDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROJECTS_REPOSITORY)
    private readonly projectsRepository: ProjectsRepository,
    @Inject(TARGETS_REPOSITORY)
    private readonly targetsRepository: TargetsRepository,
    @Inject(RECON_JOBS_REPOSITORY)
    private readonly reconJobsRepository: ReconJobsRepository,
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: CreateReconJobCommand): Promise<ReconJobDto> {
    const { workspaceId, target } = await resolveTargetForCaller(
      this.workspacesRepository,
      this.projectsRepository,
      this.targetsRepository,
      command.userId,
      command.targetId,
    );

    for (const tool of command.data.tools) {
      if (!isToolCompatibleWithTargetType(tool, target.type)) {
        throw new AppException(
          'RECON_TOOL_NOT_SUPPORTED_FOR_TARGET_TYPE',
          `${tool} does not support target type ${target.type}.`,
        );
      }
    }

    const job = await this.reconJobsRepository.create({
      workspaceId,
      projectId: target.projectId,
      targetId: target.id,
      tools: command.data.tools,
      requestedBy: command.userId,
      timeoutSeconds: this.configService.get('RECON_JOB_TIMEOUT_SECONDS', {
        infer: true,
      }),
      maxRetries: this.configService.get('RECON_JOB_MAX_RETRIES', {
        infer: true,
      }),
    });

    this.eventBus.publish(
      new ReconJobCreatedEvent(
        workspaceId,
        target.projectId,
        command.userId,
        job.id,
        {
          