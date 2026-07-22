import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus, Inject } from '@nestjs/common';
import type {
  BugBountyProgramScopeItemDto,
  CreateScopeItemRequestDto,
  UpdateScopeItemRequestDto,
} from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  BUGBOUNTY_PROGRAMS_REPOSITORY,
  type BugBountyProgramsRepository,
} from '../domain/repositories/bugbounty-programs.repository.interface.js';
import { resolveBugBountyProgramForCaller } from '../authorization.util.js';
import type { BugBountyProgramScopeItem } from '../../../prisma-types.js';

function toScopeItemDto(
  item: BugBountyProgramScopeItem,
): BugBountyProgramScopeItemDto {
  return {
    id: item.id,
    programId: item.programId,
    type: item.type,
    pattern: item.pattern,
    classification: item.classification,
    notes: item.notes,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

/// A scope item id is only ever reachable through its program (routes are
/// nested `/bugbounty/programs/:id/scope/:scopeItemId`), so resolving the
/// program first and then checking the item's programId matches is enough
/// — no separate "does this scope item belong to my workspace" repository
/// method needed.
async function resolveScopeItemForCaller(
  workspacesRepository: WorkspacesRepository,
  programsRepository: BugBountyProgramsRepository,
  userId: string,
  programId: string,
  scopeItemId: string,
) {
  await resolveBugBountyProgramForCaller(
    workspacesRepository,
    programsRepository,
    userId,
    programId,
  );
  const item = await programsRepository.findScopeItemById(scopeItemId);
  if (!item || item.programId !== programId) {
    throw new AppException(
      'BUGBOUNTY_SCOPE_ITEM_NOT_FOUND',
      'Scope item not found.',
      HttpStatus.NOT_FOUND,
    );
  }
  return item;
}

export class AddScopeItemCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly programId: string,
    public readonly data: CreateScopeItemRequestDto,
  ) {}
}

@CommandHandler(AddScopeItemCommand)
export class AddScopeItemHandler implements ICommandHandler<
  AddScopeItemCommand,
  BugBountyProgramScopeItemDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(BUGBOUNTY_PROGRAMS_REPOSITORY)
    private readonly programsRepository: BugBountyProgramsRepository,
  ) {}

  async execute(
    command: AddScopeItemCommand,
  ): Promise<BugBountyProgramScopeItemDto> {
    await resolveBugBountyProgramForCaller(
      this.workspacesRepository,
      this.programsRepository,
      command.userId,
      command.programId,
    );
    const item = await this.programsRepository.addScopeItem({
      programId: command.programId,
      type: command.data.type,
      pattern: command.data.pattern,
      classification: command.data.classification,
      notes: command.data.notes,
    });
    return toScopeItemDto(item);
  }
}

export class UpdateScopeItemCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly programId: string,
    public readonly scopeItemId: string,
    public readonly data: UpdateScopeItemRequestDto,
  ) {}
}

@CommandHandler(UpdateScopeItemCommand)
export class UpdateScopeItemHandler implements ICommandHandler<
  UpdateScopeItemCommand,
  BugBountyProgramScopeItemDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(BUGBOUNTY_PROGRAMS_REPOSITORY)
    private readonly programsRepository: BugBountyProgramsRepository,
  ) {}

  async execute(
    command: UpdateScopeItemCommand,
  ): Promise<BugBountyProgramScopeItemDto> {
    await resolveScopeItemForCaller(
      this.workspacesRepository,
      this.programsRepository,
      command.userId,
      command.programId,
      command.scopeItemId,
    );
    const updated = await this.programsRepository.updateScopeItem(
      command.scopeItemId,
      {
        classification: command.data.classification,
        notes: command.data.notes,
      },
    );
    return toScopeItemDto(updated);
  }
}

export class RemoveScopeItemCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly programId: string,
    public readonly scopeItemId: string,
  ) {}
}

@CommandHandler(RemoveScopeItemCommand)
export class RemoveScopeItemHandler implements ICommandHandler<
  RemoveScopeItemCommand,
  void
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(BUGBOUNTY_PROGRAMS_REPOSITORY)
    private readonly programsRepository: BugBountyProgramsRepository,
  ) {}

  async execute(command: RemoveScopeItemCommand): Promise<void> {
    await resolveScopeItemForCaller(
      this.workspacesRepository,
      this.programsRepository,
      command.userId,
      command.programId,
      command.scopeItemId,
    );
    await this.programsRepository.removeScopeItem(command.scopeItemId);
  }
}
