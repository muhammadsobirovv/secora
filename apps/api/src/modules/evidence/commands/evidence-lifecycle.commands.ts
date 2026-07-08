import {
  CommandHandler,
  EventBus,
  ICommand,
  ICommandHandler,
} from '@nestjs/cqrs';
import { Inject, HttpStatus } from '@nestjs/common';
import type { EvidenceDto, UpdateEvidenceRequestDto } from '@pentesthub/shared';
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
  EVIDENCE_REPOSITORY,
  type EvidenceRepository,
} from '../domain/repositories/evidence.repository.interface.js';
import { toEvidenceDto } from '../mappers/to-evidence-dto.mapper.js';
import {
  EvidenceDeletedEvent,
  EvidenceUpdatedEvent,
} from '../events/evidence-events.js';
import type { Evidence } from '../../../prisma-types.js';

export async function resolveEvidenceForCaller(
  workspacesRepository: WorkspacesRepository,
  projectsRepository: ProjectsRepository,
  evidenceRepository: EvidenceRepository,
  userId: string,
  evidenceId: string,
): Promise<{ workspaceId: string; evidence: Evidence }> {
  const evidence = await evidenceRepository.findById(evidenceId);
  if (!evidence) {
    throw new AppException(
      'EVIDENCE_NOT_FOUND',
      'Evidence not found.',
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
    evidence.projectId,
    workspace.id,
  );
  if (!project) {
    throw new AppException(
      'EVIDENCE_NOT_FOUND',
      'Evidence not found.',
      HttpStatus.NOT_FOUND,
    );
  }
  return { workspaceId: workspace.id, evidence };
}

export class UpdateEvidenceCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly evidenceId: string,
    public readonly data: UpdateEvidenceRequestDto,
  ) {}
}

@CommandHandler(UpdateEvidenceCommand)
export class UpdateEvidenceHandler implements ICommandHandler<
  UpdateEvidenceCommand,
  EvidenceDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROJECTS_REPOSITORY)
    private readonly projectsRepository: ProjectsRepository,
    @Inject(EVIDENCE_REPOSITORY)
    private readonly evidenceRepository: EvidenceRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: UpdateEvidenceCommand): Promise<EvidenceDto> {
    const { workspaceId, evidence } = await resolveEvidenceForCaller(
      this.workspacesRepository,
      this.projectsRepository,
      this.evidenceRepository,
      command.userId,
      command.evidenceId,
    );
    const updated = await this.evidenceRepository.update(
      command.evidenceId,
      command.data,
    );
    this.eventBus.publish(
      new EvidenceUpdatedEvent(
        workspaceId,
        evidence.projectId,
        command.userId,
        command.evidenceId,
      ),
    );
    return toEvidenceDto(updated);
  }
}

export class DeleteEvidenceCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly evidenceId: string,
  ) {}
}

@CommandHandler(DeleteEvidenceCommand)
export class DeleteEvidenceHandler implements ICommandHandler<
  DeleteEvidenceCommand,
  void
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROJECTS_REPOSITORY)
    private readonly projectsRepository: ProjectsRepository,
    @Inject(EVIDENCE_REPOSITORY)
    private readonly evidenceRepository: EvidenceRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: DeleteEvidenceCommand): Promise<void> {
    const { workspaceId, evidence } = await resolveEvidenceForCaller(
      this.workspacesRepository,
      this.projectsRepository,
      this.evidenceRepository,
      command.userId,
      command.evidenceId,
    );
    await this.evidenceRepository.softDelete(command.evidenceId);
    this.eventBus.publish(
      new EvidenceDeletedEvent(
        workspaceId,
        evidence.projectId,
        command.userId,
        command.evidenceId,
      ),
    );
  }
}
