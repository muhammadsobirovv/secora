import {
  CommandHandler,
  EventBus,
  ICommand,
  ICommandHandler,
} from '@nestjs/cqrs';
import { Inject, HttpStatus } from '@nestjs/common';
import type { PromoteFindingRequestDto, TargetDto } from '@pentesthub/shared';
import { FINDING_TYPE_TO_TARGET_TYPE } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  TARGETS_REPOSITORY,
  type TargetsRepository,
} from '../../targets/domain/repositories/targets.repository.interface.js';
import { TargetCreatedEvent } from '../../targets/events/target-events.js';
import { toTargetDto } from '../../targets/mappers/to-target-dto.mapper.js';
import {
  RECON_FINDINGS_REPOSITORY,
  type ReconFindingsRepository,
} from '../domain/repositories/recon-findings.repository.interface.js';
import { ReconFindingPromotedEvent } from '../events/recon-finding-events.js';
import type { TargetType } from '../../../prisma-types.js';

export class PromoteFindingToTargetCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly findingId: string,
    public readonly data: PromoteFindingRequestDto,
  ) {}
}

@CommandHandler(PromoteFindingToTargetCommand)
export class PromoteFindingToTargetHandler implements ICommandHandler<
  PromoteFindingToTargetCommand,
  TargetDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(TARGETS_REPOSITORY)
    private readonly targetsRepository: TargetsRepository,
    @Inject(RECON_FINDINGS_REPOSITORY)
    private readonly reconFindingsRepository: ReconFindingsRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: PromoteFindingToTargetCommand): Promise<TargetDto> {
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

    const finding = await this.reconFindingsRepository.findByIdForWorkspace(
      command.findingId,
      workspace.id,
    );
    if (!finding) {
      throw new AppException(
        'RECON_FINDING_NOT_FOUND',
        'Finding not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    if (finding.promotedTargetId) {
      throw new AppException(
        'RECON_FINDING_ALREADY_PROMOTED',
        'This finding has already been promoted to a target.',
      );
    }
    const targetType = FINDING_TYPE_TO_TARGET_TYPE[finding.type] as
      TargetType | undefined;
    if (!targetType) {
      throw new AppException(
        'RECON_FINDING_NOT_PROMOTABLE',
        `Findings of type ${finding.type} cannot be promoted to a target.`,
      );
    }

    const target = await this.targetsRepository.create({
      projectId: finding.projectId,
      type: targetType,
      value: finding.value,
      name: command.data.name,
      scopeStatus: command.data.scopeStatus ?? 'PENDING_REVIEW',
      createdBy: command.userId,
    });

    await this.reconFindingsRepository.markPromoted(finding.id, target.id);

    this.eventBus.publish(
      new ReconFindingPromotedEvent(
        workspace.id,
        finding.projectId,
        command.userId,
        finding.id,
        { targetId: target.id },
      ),
    );
    // Free ride on Target's existing activity/search wiring — a promoted
    // finding is, from every other module's perspective, just a normal
    // newly-created Target.
    this.eventBus.publish(
      new TargetCreatedEvent(
        workspace.id,
        finding.projectId,
        command.userId,
        target.id,
      ),
    );

    const withTags = await this.targetsRepository.findById(target.id);
    return toTargetDto(withTags!);
