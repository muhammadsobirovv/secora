import {
  CommandHandler,
  EventBus,
  ICommand,
  ICommandHandler,
} from '@nestjs/cqrs';
import { Inject, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PROFILE_SCANNERS } from '@pentesthub/shared';
import type {
  CreateVulnScanJobRequestDto,
  VulnScanJobDto,
} from '@pentesthub/shared';
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
  VULN_SCAN_JOBS_REPOSITORY,
  type VulnScanJobsRepository,
} from '../domain/repositories/vuln-scan-jobs.repository.interface.js';
import {
  VULN_SCAN_TEMPLATES_REPOSITORY,
  type VulnScanTemplatesRepository,
} from '../domain/repositories/vuln-scan-templates.repository.interface.js';
import { isScannerCompatibleWithTargetType } from '../scanner-runners/scanner-target-compatibility.js';
import { toVulnScanJobDto } from '../mappers/to-vuln-scan-job-dto.mapper.js';
import { VulnScanJobCreatedEvent } from '../events/vuln-scan-job-events.js';
import { getRequestId } from '../../../observability/request-context.js';
import {
  TargetAuthorizationService,
  type RequestContextInput,
} from '../../target-authorization/target-authorization.service.js';
import { ScanAdmissionService } from '../pipeline/scan-admission.service.js';
import { PROFILE_JOB_TIMEOUT_SECONDS } from '../pipeline/tool-catalog.js';

export class CreateVulnScanJobCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly targetId: string,
    public readonly data: CreateVulnScanJobRequestDto,
    /// Caller IP / user agent for the audit trail (REST only).
    public readonly context?: RequestContextInput,
  ) {}
}

/// "Start Scan" (spec API section). If templateId is given, the
/// template's scanners/config are the defaults; an explicit
/// data.scanners/data.config always wins over the template's — the
/// template is a convenience preset, not a lock.
@CommandHandler(CreateVulnScanJobCommand)
export class CreateVulnScanJobHandler implements ICommandHandler<
  CreateVulnScanJobCommand,
  VulnScanJobDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROJECTS_REPOSITORY)
    private readonly projectsRepository: ProjectsRepository,
    @Inject(TARGETS_REPOSITORY)
    private readonly targetsRepository: TargetsRepository,
    @Inject(VULN_SCAN_JOBS_REPOSITORY)
    private readonly vulnScanJobsRepository: VulnScanJobsRepository,
    @Inject(VULN_SCAN_TEMPLATES_REPOSITORY)
    private readonly vulnScanTemplatesRepository: VulnScanTemplatesRepository,
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly eventBus: EventBus,
    private readonly scopeEngine: ScopeEngineService,
    private readonly quota: QuotaService,
    private readonly usage: UsageService,
    @Inject(TargetAuthorizationService)
    private readonly targetAuthorization: TargetAuthorizationService,
    private readonly scanAdmission: ScanAdmissionService,
  ) {}

  async execute(command: CreateVulnScanJobCommand): Promise<VulnScanJobDto> {
    const { workspaceId, isDemoWorkspace, target } = await resolveTargetForCaller(
      this.workspacesRepository,
      this.projectsRepository,
      this.targetsRepository,
      command.userId,
      command.targetId,
    );

    // Module 15 — task #352 (demo mode). Same reasoning as
    // CreateReconJobHandler's identical guard: demo workspaces are
    // read-only sandboxes over pre-seeded data, reachable from an
    // unauthenticated public entry point — never allow a real scan.
    if (isDemoWorkspace) {
      throw new AppException(
        'DEMO_WORKSPACE_READ_ONLY',
        'This is a demo workspace with sample data only — new scans are disabled. Sign up for a free account to run real scans.',
        HttpStatus.FORBIDDEN,
      );
    }

    // Module 16 — task #370. Scope Engine gate: refuses to start a Vuln
    // scan against a target that is OUT_OF_SCOPE (Target.scopeStatus or
    // any linked program's scope rules) or still PENDING_REVIEW. Mirrors
    // CreateReconJobHandler's identical gate exactly.
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
      operationType: 'VULN_SCAN',
      ipAddress: command.context?.ipAddress,
      userAgent: command.context?.userAgent,
    });

    // Target authorization layer: every vulnerability scanner is ACTIVE,
    // so a valid, unexpired attestation and the active-scan network guard
    // are always required. Every caller (REST, AI tools, MCP, AI
    // investigation) goes through this handler.
    const authorization =
      await this.targetAuthorization.assertActiveScanAllowed({
        userId: command.userId,
        workspaceId,
        target,
        operationType: 'VULN_SCAN',
        context: command.context,
      });

    // Rate limits first (cheap), plan quota after: one scan per target at a
    // time, N per target and M per workspace per hour. 429 with a stable code.
    await this.scanAdmission.assertAllowed({ workspaceId, targetId: target.id });

    const profile = command.data.profile;
    if (
      profile === 'DEEP' &&
      !this.configService.get('SCAN_DEEP_PROFILE_ENABLED', { infer: true })
    ) {
      throw new AppException(
        'SCAN_PROFILE_DISABLED',
        'The DEEP scan profile is not enabled on this deployment.',
        HttpStatus.FORBIDDEN,
      );
    }

    // DEEP includes default-credential checks: the caller must say so.
    if (profile === 'DEEP' && command.data.confirmDeep !== true) {
      throw new AppException(
        'SCAN_DEEP_CONFIRMATION_REQUIRED',
        'The DEEP scan profile submits default credentials to login forms. Confirm it explicitly to continue.',
        HttpStatus.BAD_REQUEST,
      );
    }

    let scanners = command.data.scanners;
    let config = command.data.config ?? null;

    if (command.data.templateId) {
      const template =
        await this.vulnScanTemplatesRepository.findByIdForWorkspace(
          command.data.templateId,
          workspaceId,
        );
      if (!template) {
        throw new AppException(
          'VULN_SCAN_TEMPLATE_NOT_FOUND',
          'Scan template not found.',
          HttpStatus.NOT_FOUND,
        );
      }
      scanners = command.data.scanners?.length
        ? command.data.scanners
        : template.scanners;
      config =
        command.data.config ??
        (template.config as Record<string, unknown> | null);
    }

    // A profile makes this a pipeline run. The profile decides which scanners
    // run (QUICK: native checks; STANDARD: + nuclei; DEEP: + discovery, content
    // and XSS checks), not the request, so a caller cannot ask a profile for a
    // scanner it does not include. The profile is stored in the job config; the
    // worker reads it from there.
    if (profile) {
      scanners = [...PROFILE_SCANNERS[profile]];
      config = {
        ...(config ?? {}),
        profile,
        ...(profile === 'DEEP' ? { deepConfirmed: true } : {}),
      };
    }

    // The engagement a scan runs under is decided here, never by the caller:
    // a roeId smuggled in through config or a template is dropped.
    {
      const { roeId: _ignored, ...rest } = (config ?? {}) as Record<string, unknown>;
      void _ignored;
      config =
        authorization.roeId || Object.keys(rest).length > 0
          ? { ...rest, ...(authorization.roeId ? { roeId: authorization.roeId } : {}) }
          : null;
    }

    // A profile's scanners are driven by the pipeline (against the verified
    // host, whatever the target type), so the by-hand compatibility table only
    // applies to jobs that name their own scanners.
    for (const scanner of profile ? [] : scanners) {
      if (!isScannerCompatibleWithTargetType(scanner, target.type)) {
        throw new AppException(
          'VULN_SCANNER_NOT_SUPPORTED_FOR_TARGET_TYPE',
          `${scanner} does not support target type ${target.type}.`,
        );
      }
    }

    // Module 20 — Phase 8 (billing finalization). Mirrors
    // CreateReconJobHandler's identical `SCANNER_JOBS` quota gate exactly
    // — see that handler's doc comment for the full reasoning.
    const { organizationId } = await this.quota.enforceForWorkspace(workspaceId, command.userId, 'SCANNER_JOBS');

    const job = await this.vulnScanJobsRepository.create({
      workspaceId,
      projectId: target.projectId,
      targetId: target.id,
      scanners,
      templateId: command.data.templateId ?? null,
      config,
      priority: command.data.priority ?? 0,
      requestedBy: command.userId,
      timeoutSeconds: Math.max(
        this.configService.get('VULN_JOB_TIMEOUT_SECONDS', { infer: true }),
        profile ? PROFILE_JOB_TIMEOUT_SECONDS[profile] : 0,
      ),
      maxRetries: this.configService.get('VULN_JOB_MAX_RETRIES', {
        infer: true,
      }),
      requestId: getRequestId(),
    });

    await this.targetAuthorization.recordScanStarted({
      userId: command.userId,
      workspaceId,
      target,
      operationType: 'VULN_SCAN',
      jobId: job.id,
      tools: scanners,
      active: true,
      authorization,
      context: command.context,
    });

    // Best-effort, after the job already exists — see
    // CreateReconJobHandler's identical comment.
    this.usage
      .record({ organizationId: organizationId ?? undefined, workspaceId, userId: command.userId, resourceType: 'SCANNER_JOBS', quantity: 1, unit: 'jobs' })
      .catch(() => undefined);

    this.eventBus.publish(
      new VulnScanJobCreatedEvent(
        workspaceId,
        target.projectId,
        command.userId,
        job.id,
        {
          scanners,
          targetId: target.id,
        },
      ),
    );

    return toVulnScanJobDto(job);
  }
}
