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
  ) {}

  async execute(command: CreateVulnScanJobCommand): Promise<VulnScanJobDto> {
    const { workspaceId, target } = await resolveTargetForCaller(
      this.workspacesRepository,
      this.projectsRepository,
      this.targetsRepository,
      command.userId,
      command.targetId,
    );

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
