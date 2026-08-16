import {
  CommandHandler,
  EventBus,
  ICommand,
  ICommandHandler,
} from '@nestjs/cqrs';
import { Inject, HttpStatus } from '@nestjs/common';
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
import { ScopeEngineService } from '../../security/scope-engine.service.js';
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
    private readonly scopeEngine: ScopeEngineService,
  ) {}

  async execute(command: CreateReconJobCommand): Promise<ReconJobDto> {
    const { workspaceId, isDemoWorkspace, target } = await resolveTargetForCaller(
      this.workspacesRepository,
      this.projectsRepository,
      this.targetsRepository,
      command.userId,
      command.targetId,
    );

    // Module 15 — task #352 (demo mode). Demo workspaces only ever hold
    // pre-seeded, already-completed synthetic data — POST /demo/session is
    // an unauthenticated, publicly reachable entry point, and it must
    // never be able to trigger a real network scan against an arbitrary
    // target. Reject before any tool-compatibility work, not after.
    if (isDemoWorkspace) {
      throw new AppException(
        'DEMO_WORKSPACE_READ_ONLY',
        'This is a demo workspace with sample data only — new scans are disabled. Sign up for a free account to run real scans.',
        HttpStatus.FORBIDDEN,
      );
    }

    // Module 16 — task #370. The Scope Engine gate: refuses to create a
    // Recon job against a target that is explicitly OUT_OF_SCOPE (any
    // linked program's scope rules, or Target.scopeStatus itself) or
    // still PENDING_REVIEW. Runs after the demo-workspace check (that's a
    // coarser, cheaper gate) and before any tool-compatibility work.
    await this.scopeEngine.assertExecutionAllowed({
      userId: command.userId,
      workspaceId,
      target: {
        id: target.id,
        type: target.type,
        value: target.value,
        scopeStatus: target.scopeStatus,
        projectId: target.projectId,
      },
      operationType: 'RECON_JOB',
    });

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
          tools: command.data.tools,
          targetId: target.id,
        },
      ),
    );

    return toReconJobDto(job);
  }
}
