import {
  CommandHandler,
  EventBus,
  ICommand,
  ICommandHandler,
} from '@nestjs/cqrs';
import { Inject, HttpStatus } from '@nestjs/common';
import type {
  UpdateVulnFindingStatusRequestDto,
  VulnFindingDto,
} from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  VULN_FINDINGS_REPOSITORY,
  type VulnFindingsRepository,
} from '../domain/repositories/vuln-findings.repository.interface.js';
import { toVulnFindingDto } from '../mappers/to-vuln-finding-dto.mapper.js';
import {
  VulnFindingConfirmedEvent,
  VulnFindingResolvedEvent,
  VulnFindingUpdatedEvent,
} from '../events/vuln-finding-events.js';
import type { VulnFindingStatus } from '../../../prisma-types.js';

const RESOLVED_STATUSES: VulnFindingStatus[] = [
  'FIXED',
  'FALSE_POSITIVE',
  'ACCEPTED_RISK',
];

export class UpdateVulnFindingStatusCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly findingId: string,
    public readonly data: UpdateVulnFindingStatusRequestDto,
  ) {}
}

/// Analyst triage (Finding Status). Always publishes FindingUpdated;
/// additionally publishes FindingConfirmed when the new status is
/// CONFIRMED, or FindingResolved when it's one of the three "resolved"
/// terminal states — see vuln-finding-events.ts for why both fire
/// alongside FindingUpdated rather than instead of it.
@CommandHandler(UpdateVulnFindingStatusCommand)
export class UpdateVulnFindingStatusHandler implements ICommandHandler<
  UpdateVulnFindingStatusCommand,
  VulnFindingDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(VULN_FINDINGS_REPOSITORY)
    private readonly vulnFindingsRepository: VulnFindingsRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(
    command: UpdateVulnFindingStatusCommand,
  ): Promise<VulnFindingDto> {
    const workspace =
      await this.workspacesRepository.findPersonalWorkspaceForUser(
        command.userId,
      );
    if (!workspace) {
      throw new AppException(
        'WORKSPACE_NOT_FOUND',
        'Workspace not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    const finding = await this.vulnFindingsRepository.findByIdForWorkspace(
      command.findingId,
      workspace.id,
    );
    if (!finding) {
      throw new AppException(
        'VULN_FINDING_NOT_FOUND',
        'Finding not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    const updated = await this.vulnFindingsRepository.updateStatus(
      finding.id,
      command.data.status,
    );

    this.eventBus.publish(
      new VulnFindingUpdatedEvent(
        workspace.id,
        finding.projectId,
        command.userId,
        finding.id,
        { status: command.data.status },
      ),
    );
    if (command.data.status === 'CONFIRMED') {
      this.eventBus.publish(
        new VulnFindingConfirmedEvent(
          workspace.id,
          finding.projectId,
          command.userId,
          finding.id,
        ),
      );
    }
    if (RESOLVED_STATUSES.includes(command.data.status)) {
      this.eventBus.publish(
        new VulnFindingResolvedEvent(
          workspace.id,
          finding.projectId,
          command.userId,
          finding.id,
          {
            status: command.data.status,
          },
        ),
      );
    }

    return toVulnFindingDto(updated);
  }
}
