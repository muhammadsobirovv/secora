import {
  CommandHandler,
  EventBus,
  ICommand,
  ICommandHandler,
} from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import type { CreateEvidenceRequestDto, EvidenceDto } from '@pentesthub/shared';
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
import { resolveProjectInCallerWorkspace } from '../../../common/utils/project-access.util.js';
import { runOrMapInvalidReference } from '../../../common/utils/prisma-error.util.js';
import { toEvidenceDto } from '../mappers/to-evidence-dto.mapper.js';
import { EvidenceCreatedEvent } from '../events/evidence-events.js';

export class CreateEvidenceCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly projectId: string,
    public readonly data: CreateEvidenceRequestDto,
  ) {}
}

@CommandHandler(CreateEvidenceCommand)
export class CreateEvidenceHandler implements ICommandHandler<
  CreateEvidenceCommand,
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

  async execute(command: CreateEvidenceCommand): Promise<EvidenceDto> {
    const { workspace } = await resolveProjectInCallerWorkspace(
      this.workspacesRepository,
      this.projectsRepository,
      command.userId,
      command.projectId,
    );

    const evidence = await runOrMapInvalidReference(() =>
      this.evidenceRepository.create({
        projectId: command.projectId,
        targetId: command.data.targetId,
        type: command.data.type,
        title: command.data.title,
        description: command.data.description,
        textContent: command.data.textContent,
        createdBy: command.userId,
      }),
    );

    this.eventBus.publish(
      new EvidenceCreatedEvent(
        workspace.id,
        command.projectId,
        command.userId,
        evidence.id,
      ),
    );

    return toEvidenceDto(evidence);
  }
}
