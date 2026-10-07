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
import { QuotaService } from '../../billing/quota.service.js';
import { UsageService } from '../../billing/usage.service.js';
import {
  RECON_JOBS_REPOSITORY,
  type ReconJobsRepository,
} from '../domain/repositories/recon-jobs.repository.interface.js';
import { isToolCompatibleWithTargetType } from '../tool-runners/tool-target-compatibility.js';
import { toReconJobDto } from '../mappers/to-recon-job-dto.mapper.js';
import { ReconJobCreatedEvent } from '../events/recon-job-events.js';
import { getRequestId } from '../../../observability/request-context.js';
import { isPassiveReconTool } from '@pentesthub/shared';
import {
  TargetAuthorizationService,
  type RequestContextInput,
} from '../../target-authorization/target-authorization.service.js';

export class CreateReconJobCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly targetId: string,
    public readonly data: CreateReconJobRequestDto,
    /// Caller IP / user agent for the audit trail (REST only; internal
    /// callers such as monitoring or AI tools omit it).
    public readonly context?: RequestContextInput,
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
    private readonly quota: QuotaService,
    private readonly usage: UsageService,
    @Inject(TargetAuthorizationService)
    private readonly targetAuthorization: TargetAuthorizationService,
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
      ipAddress: command.context?.ipAddress,
      userAgent: command.context?.userAgent,
    });

    for (const tool of command.data.tools) {
      if (!isToolCompatibleWithTargetType(tool, target.type)) {
        throw new AppException(
          'RECON_TOOL_NOT_SUPPORTED_FOR_TARGET_TYPE',
          `${tool} does not support target type ${target.type}.`,
        );
      }
    }

    // Target authorization layer. A job with any ACTIVE tool needs a
    // valid, unexpired attestation and must pass the active-scan network
    // guard; a passive-only job (public third-party sources only) needs
    // neither. Every handler path (REST, AI tools, MCP, monitoring, AI
    // investigation) goes through here.
    const active = command.data.tools.some((tool) => !isPassiveReconTool(tool));
    const authorization = active
      ? await this.targetAuthorization.assertActiveScanAllowed({
          userId: command.userId,
          workspaceId,
          target,
          operationType: 'RECON_JOB',
          context: command.context,
        })
      : null;

    // Module 20 — Phase 8 (billing finalization). `RECON_JOBS` has a
    // configurable per-plan limit (see plan-defaults.ts) that was never
    // actually enforced anywhere in this handler — throws `QUOTA_EXCEEDED`
    // (429) before creating the job if the workspace's org is over its
    // hard limit. Unlimited (no-op) for any workspace with no
    // organization or no configured QuotaPolicy/Plan limit — the same
    // zero-configuration Community Edition default every other Module 15
    // enforcement mechanism has, by construction.
    const { organizationId } = await this.quota.enforceForWorkspace(workspaceId, command.userId, 'RECON_JOBS');

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
      requestId: getRequestId(),
    });

    await this.targetAuthorization.recordScanStarted({
      userId: command.userId,
      workspaceId,
      target,
      operationType: 'RECON_JOB',
      jobId: job.id,
      tools: command.data.tools,
      active,
      authorization,
      context: command.context,
    });

    // Best-effort, after the job already exists — a metering write must
    // never undo or fail an already-accepted job, same posture
    // `AiBudgetEnforcerService.recordUsage()` takes on its own metering.
    this.usage
      .record({ organizationId: organizationId ?? undefined, workspaceId, userId: command.userId, resourceType: 'RECON_JOBS', quantity: 1, unit: 'jobs' })
      .catch(() => undefined);

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
