import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  BUGBOUNTY_PROGRAMS_REPOSITORY,
  type BugBountyProgramsRepository,
} from '../domain/repositories/bugbounty-programs.repository.interface.js';
import { resolveBugBountyProgramForCaller } from '../authorization.util.js';

export class DeleteBugBountyProgramCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly programId: string,
  ) {}
}

/// Soft delete, same as Project/Target/Note (Module 2) — a program can be
/// restored later; there is deliberately no restore endpoint yet, matching
/// those modules' current state, not a Module 6-specific gap.
@CommandHandler(DeleteBugBountyProgramCommand)
export class DeleteBugBountyProgramHandler implements ICommandHandler<
  DeleteBugBountyProgramCommand,
  void
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(BUGBOUNTY_PROGRAMS_REPOSITORY)
    private readonly programsRepository: BugBountyProgramsRepository,
  ) {}

  async execute(command: DeleteBugBountyProgramCommand): Promise<void> {
    await resolveBugBountyProgramForCaller(
      this.workspacesRepository,
      this.programsRepository,
      command.userId,
      command.programId,
    );
    await this.programsRepository.softDelete(command.programId);
  }
}
