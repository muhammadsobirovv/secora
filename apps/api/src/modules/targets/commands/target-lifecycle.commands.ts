import {
  CommandHandler,
  EventBus,
  ICommand,
  ICommandHandler,
} from '@nestjs/cqrs';
import { Inject, HttpStatus } from '@nestjs/common';
import type { TargetDto, UpdateTargetRequestDto } from '@pentesthub/shared';
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
  type TargetWithTags,
} from '../domain/repositories/targets.repository.interface.js';
import { toTargetDto } from '../mappers/to-target-dto.mapper.js';
import {
  TargetDeletedEvent,
  TargetUpdatedEvent,
} from '../events/target-events.js';

/// Target ids are globally unique UUIDs, so single-target routes don't
/// need the client to also supply a projectId (which would be awkward on
/// GET/DELETE — no reliable body on those verbs across HTTP clients).
/// Resolve the target first, then verify its own project belongs to the
/// caller's workspace — same enumeration-safe 404 either way.
export async function resolveTargetForCaller(
  workspacesRepository: WorkspacesRepository,
  projectsRepository: ProjectsRepository,
  targetsRepository: TargetsRepository,
  userId: string,
  targetId: string,
): Promise<{ workspaceId: string; isDemoWorkspace: boolean; target: TargetWithTags }> {
  const target = await targetsRepository.findById(targetId);
  if (!target) {
    throw new AppException(
      'TARGET_NOT_FOUND',
      'Target not found.',
      HttpStatus.NOT_FOUND,
    );
  }
  const workspace =
    await workspacesRepository.findPersonalWorkspaceForUser(userId);
  if (!workspace) {
    throw new AppException(
      'WORKSPACE_NOT_FOUND',
      'Workspace not found.',
      HttpStatus.NOT_FOUND,
    );
  }
  const project = await projectsRepository.findByIdForWorkspace(
    target.projectId,
    workspace.id,
  );
  if (!project) {
    throw new AppException(
      'TARGET_NOT_FOUND',
      'Target not found.',
      HttpStatus.NOT_FOUND,
    );
  }
  // Module 15 — task #352 (demo mode). Surfaced here, at the one shared
  // resolution path every Target-scoped command uses, rather than
  // duplicated per caller. Most callers (UpdateTarget, DeleteTarget, ...)
  // don't destructure it and are unaffected; CreateReconJob/
  // CreateVulnScanJob do, to reject new scan requests against a demo
  // workspace (see those handlers for why: a public, unauthenticated demo
  // entry point must never be able to trigger a real network scan).
  return { workspaceId: workspace.id, isDemoWorkspace: workspace.isDemo, target };
}

export class UpdateTargetCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly targetId: string,
    public readonly data: UpdateTargetRequestDto,
  ) {}
}

@CommandHandler(UpdateTargetCommand)
export class UpdateTargetHandler implements ICommandHandler<
  UpdateTargetCommand,
  TargetDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROJECTS_REPOSITORY)
    private readonly projectsRepository: ProjectsRepository,
    @Inject(TARGETS_REPOSITORY)
    private readonly targetsRepository: TargetsRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: UpdateTargetCommand): Promise<TargetDto> {
    const { workspaceId, target } = await resolveTargetForCaller(
      this.workspacesRepository,
      this.projectsRepository,
      this.targetsRepository,
      command.userId,
      command.targetId,
    );
    await this.targetsRepository.update(command.targetId, command.data);
    this.eventBus.publish(
      new TargetUpdatedEvent(
        workspaceId,
        target.projectId,
        command.userId,
        command.targetId,
      ),
    );
    const updated = await this.targetsRepository.findById(command.targetId);
    return toTargetDto(updated!);
  }
}

export class DeleteTargetCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly targetId: string,
  ) {}
}

@CommandHandler(DeleteTargetCommand)
export class DeleteTargetHandler implements ICommandHandler<
  DeleteTargetCommand,
  void
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROJECTS_REPOSITORY)
    private readonly projectsRepository: ProjectsRepository,
    @Inject(TARGETS_REPOSITORY)
    private readonly targetsRepository: TargetsRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: DeleteTargetCommand): Promise<void> {
    const { workspaceId, target } = await resolveTargetForCaller(
      this.workspacesRepository,
      this.projectsRepository,
      this.targetsRepository,
      command.userId,
      command.targetId,
    );
    await this.targetsRepository.softDelete(command.targetId);
    this.eventBus.publish(
      new TargetDeletedEvent(
        workspaceId,
        target.projectId,
        command.userId,
        command.targetId,
      ),
    );
  }
}
