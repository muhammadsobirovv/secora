import {
  CommandHandler,
  EventBus,
  ICommand,
  ICommandHandler,
} from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import type {
  BugBountyProgramDto,
  CreateBugBountyProgramRequestDto,
} from '@pentesthub/shared';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  BUGBOUNTY_PROGRAMS_REPOSITORY,
  type BugBountyProgramsRepository,
} from '../domain/repositories/bugbounty-programs.repository.interface.js';
import { resolveWorkspaceForCaller } from '../authorization.util.js';
import { toBugBountyProgramDto } from '../mappers/to-bugbounty-program-dto.mapper.js';
import { BugBountyProgramCreatedEvent } from '../events/bugbounty-program-events.js';

export class CreateBugBountyProgramCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly data: CreateBugBountyProgramRequestDto,
  ) {}
}

@CommandHandler(CreateBugBountyProgramCommand)
export class CreateBugBountyProgramHandler implements ICommandHandler<
  CreateBugBountyProgramCommand,
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
    command: CreateBugBountyProgramCommand,
  ): Promise<BugBountyProgramDto> {
    const workspace = await resolveWorkspaceForCaller(
      this.workspacesRepository,
      command.userId,
    );

    const program = await this.programsRepository.create({
      workspaceId: workspace.id,
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
      createdBy: command.userId,
    });

    this.eventBus.publish(
      new BugBountyProgramCreatedEvent(
        workspace.id,
        program.projectId,
        command.userId,
        program.id,
        { platform: program.platform, name: program.name },
      ),
    );

    return toBugBountyProgramDto(program, {
      scopeItemCount: 0,
      targetCount: 0,
      findingCount: 0,
    });
  