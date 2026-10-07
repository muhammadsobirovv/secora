import {
  CommandHandler,
  EventBus,
  ICommand,
  ICommandHandler,
} from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import type { CreateTargetRequestDto, TargetDto } from '@pentesthub/shared';
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
} from '../domain/repositories/targets.repository.interface.js';
import { resolveProjectInCallerWorkspace } from '../../../common/utils/project-access.util.js';
import { toTargetDto } from '../mappers/to-target-dto.mapper.js';
import { TargetCreatedEvent } from '../events/target-events.js';
import { Transactional } from '@nestjs-cls/transactional';
import {
  TargetAuthorizationService,
  type RequestContextInput,
} from '../../target-authorization/target-authorization.service.js';

export class CreateTargetCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly projectId: string,
    public readonly data: CreateTargetRequestDto,
    /// Caller IP / user agent, recorded with the authorization attestation.
    public readonly context?: RequestContextInput,
  ) {}
}

@CommandHandler(CreateTargetCommand)
export class CreateTargetHandler implements ICommandHandler<
  CreateTargetCommand,
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
    @Inject(TargetAuthorizationService)
    private readonly targetAuthorization: TargetAuthorizationService,
  ) {}

  /// Transactional so a target created with an authorization attestation
  /// never exists without it (and vice versa).
  @Transactional()
  async execute(command: CreateTargetCommand): Promise<TargetDto> {
    const { workspace } = await resolveProjectInCallerWorkspace(
      this.workspacesRepository,
      this.projectsRepository,
      command.userId,
      command.projectId,
    );

    const target = await this.targetsRepository.create({
      projectId: command.projectId,
      type: command.data.type,
      value: command.data.value,
      name: command.data.name,
      description: command.data.description,
      environment: command.data.environment,
      scopeStatus: command.data.scopeStatus,
      createdBy: command.userId,
    });

    this.eventBus.publish(
      new TargetCreatedEvent(
        workspace.id,
        command.projectId,
        command.userId,
        target.id,
      ),
    );

    if (command.data.authorization) {
      await this.targetAuthorization.attestTarget({
        userId: command.userId,
        workspaceId: workspace.id,
        target,
        data: command.data.authorization,
        context: command.context,
      });
    }

    const withTags = await this.targetsRepository.findById(target.id);
    return toTargetDto(withTags!);
  }
}
