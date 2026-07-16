import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import type { BugBountyProgramTargetDto } from '@pentesthub/shared';
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
  BUGBOUNTY_PROGRAMS_REPOSITORY,
  type BugBountyProgramsRepository,
} from '../domain/repositories/bugbounty-programs.repository.interface.js';
import { resolveBugBountyProgramForCaller } from '../authorization.util.js';

export class LinkProgramTargetCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly programId: string,
    public readonly targetId: string,
  ) {}
}

/// Links an existing Target (Module 2) to a Program — see
/// BugBountyProgramTarget's schema comment for why this is a join table
/// rather than a column on Target. Both the program and the target are
/// independently resolved-for-caller first, so linking across workspaces
/// is impossible even though both ids are freeform UUIDs.
@CommandHandler(LinkProgramTargetCommand)
export class LinkProgramTargetHandler implements ICommandHandler<
  LinkProgramTargetCommand,
  BugBountyProgramTargetDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROJECTS_REPOSITORY)
    private readonly projectsRepository: ProjectsRepository,
    @Inject(TARGETS_REPOSITORY)
    private readonly targetsRepository: TargetsRepository,
    @Inject(BUGBOUNTY_PROGRAMS_REPOSITORY)
    private readonly programsRepository: BugBountyProgramsRepository,
  ) {}

  async execute(
    command: LinkProgramTargetCommand,
  ): Promise<BugBountyProgramTargetDto> {
    await resolveBugBountyProgramForCaller(
      this.workspacesRepository,
      this.programsRepository,
      command.userId,
      command.programId,
    );
    await resolveTargetForCaller(
      this.workspacesRepository,
      this.projectsRepository,
      this.targetsRepository,
      command.userId,
      command.targetId,
    );

    const link = await this.programsRepository.linkTarget(
      command.programId,
      command.targetId,
    );
    return {
      programId: link.programId,
      targetId: link.targetId,
      linkedAt: link.linkedAt.toISOString(),
    };
  }
}

export class UnlinkProgramTargetCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly programId: string,
    public readonly targetId: string,
  ) {}
}

@CommandHandler(UnlinkProgramTargetCommand)
export class UnlinkProgramTargetHandler implements ICommandHandler<
  UnlinkProgramTargetCommand,
  void
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(BUGBOUNTY_PROGRAMS_REPOSITORY)
    private readonly programsRepository: BugBountyProgramsRepository,
  ) {}

  async execute(command: UnlinkProgramTargetCommand): Promise<void> {
    await resolveBugBountyProgramForCaller(
      this.workspacesRepository,
      this.programsRepository,
      command.userId,
      command.programId,
    );
    await this.programsRepository.unlinkTarget(
      command.programId,
      command.targetId,
    )