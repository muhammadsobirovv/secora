import {
  CommandHandler,
  EventBus,
  ICommand,
  ICommandHandler,
} from '@nestjs/cqrs';
import { Inject, HttpStatus } from '@nestjs/common';
import type {
  BulkUpdateVulnFindingsRequestDto,
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

/// Bulk Actions (spec Frontend section) — the same status transition as
/// UpdateVulnFindingStatusCommand, applied to many findings in one write.
export class BulkUpdateVulnFindingsCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly data: BulkUpdateVulnFindingsRequestDto,
  ) {}
}

@CommandHandler(BulkUpdateVulnFindingsCommand)
export class BulkUpdateVulnFindingsHandler implements ICommandHandler<
  BulkUpdateVulnFindingsCommand,
  VulnFindingDto[]
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(VULN_FINDINGS_REPOSITORY)
    private readonly vulnFindingsRepository: VulnFindingsRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(
    command: BulkUpdateVulnFindingsCommand,
  ): Promise<VulnFindingDto[]> {
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

    const updated = await this.vulnFindingsRepository.bulkUpdateStatus(
      command.data.findingIds,
      workspace.id,
      command.data.status,
    );

    for (const finding of updated) {
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
    }

    return updated.map(toVulnFindingDto);
  }
}
