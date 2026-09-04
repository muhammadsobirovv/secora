import {
  CommandHandler,
  EventBus,
  ICommand,
  ICommandHandler,
} from '@nestjs/cqrs';
import { Inject, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

export class CreateVulnScanJobCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly targetId: string,
    public readonly data: CreateVulnScanJobRequestDto,
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
    });

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

    for (const scanner of scanners) {
      if (!isScannerCompatibleWithTargetType(scanner, target.type)) {
        throw new AppException(
          'VULN_SCANNER_NOT_SUPPORTED_FOR_TARGET_TYPE',
          `${scanner} does not support target type ${target.type}.`,
        );
      }
    }

    const job = await this.vulnScanJobsRepository.create({
      workspaceId,
      projectId: target.projectId,
      targetId: target.id,
      scanners,
      templateId: command.data.templateId ?? null,
      config,
      priority: command.data.priority ?? 0,
      requestedBy: command.userId,
      timeoutSeconds: this.configService.get('VULN_JOB_TIMEOUT_SECONDS', {
        infer: true,
      }),
      maxRetries: this.configService.get('VULN_JOB_MAX_RETRIES', {
        infer: true,
      }),
      requestId: getRequestId(),
    });

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
