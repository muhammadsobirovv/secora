import {
  CommandHandler,
  EventBus,
  ICommand,
  ICommandHandler,
} from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import type {
  BugBountyProgramDto,
  UpdateBugBountyProgramRequestDto,
} from '@pentesthub/shared';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  BUGBOUNTY_PROGRAMS_REPOSITORY,
  type BugBountyProgramsRepository,
} from '../domain/repositories/bugbounty-programs.repository.interface.js';
import { resolveBugBountyProgramForCaller } from '../authorization.util.js';
import { toBugBountyProgramDto } from '../mappers/to-bugbounty-program-dto.mapper.js';
import { BugBountyProgramUpdatedEvent } from '../events/bugbounty-program-events.js';

export class UpdateBugBountyProgramCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly programId: string,
    public readonly data: UpdateBugBountyProgramRequestDto,
  ) {}
}

@CommandHandler(UpdateBugBountyProgramCommand)
export class UpdateBugBountyProgramHandler implements ICommandHandler<
  UpdateBugBountyProgramCommand,
  BugBountyProgramDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(BUGBOUNTY_PROGRAMS_REPOSITORY)
    private readonly programsRepository: BugBountyProgramsRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(
    command: UpdateBugBountyProgramCommand,
  ): Promise<BugBountyProgramDto> {
    const { workspaceId } = await resolveBugBountyProgramForCaller(
      this.workspacesRepository,
      this.programsRepository,
      command.userId,
      command.programId,
    );

    const updated = await this.programsRepository.update(command.programId, {
      projectId: command.data.projectId,
      name: command.data.name,
      platform: command.data.platform,
      organization: command.data.organization,
      url: command.data.url,
      status: command.data.status,
      rulesMarkdown: command.data.rulesMarkdown,
      bountyTable: command.data.bountyTable,
      severityMatrix: command.data.severityMatrix,
      disclosurePolicy: command.data.disclosurePolicy,
      notesMarkdown: command.data.notesMarkdown,
      tags: command.data.tags,
      favorite: command.data.favorite,
      safeHarbor: command.data.safeHarbor,
      rateLimits: command.data.rateLimits,
    });

    this.eventBus.publish(
      new BugBountyProgramUpdatedEvent(
        workspaceId,
        updated.projectId,
        command.userId,
        updated.id,
      ),
    );

    const [scopeItemCount, targetCount] = await Promise.all([
      this.programsRepository.countScopeItems(updated.id),
      this.programsRepository.countLinkedTargets(updated.id),
    ]);

    return toBugBountyProgramDto(updated, {
      scopeItemCount,
      targetCount,
      findingCount: 0,
    });
  }
}
