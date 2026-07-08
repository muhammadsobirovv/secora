import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import type { ListTargetsQueryDto, TargetDto } from '@pentesthub/shared';
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
import { resolveTargetForCaller } from '../commands/target-lifecycle.commands.js';
import { toTargetDto } from '../mappers/to-target-dto.mapper.js';

export class GetTargetQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly targetId: string,
  ) {}
}

@QueryHandler(GetTargetQuery)
export class GetTargetHandler implements IQueryHandler<
  GetTargetQuery,
  TargetDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROJECTS_REPOSITORY)
    private readonly projectsRepository: ProjectsRepository,
    @Inject(TARGETS_REPOSITORY)
    private readonly targetsRepository: TargetsRepository,
  ) {}

  async execute(query: GetTargetQuery): Promise<TargetDto> {
    const { target } = await resolveTargetForCaller(
      this.workspacesRepository,
      this.projectsRepository,
      this.targetsRepository,
      query.userId,
      query.targetId,
    );
    return toTargetDto(target);
  }
}

export class ListTargetsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly projectId: string,
    public readonly filter: ListTargetsQueryDto,
  ) {}
}

@QueryHandler(ListTargetsQuery)
export class ListTargetsHandler implements IQueryHandler<
  ListTargetsQuery,
  TargetDto[]
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROJECTS_REPOSITORY)
    private readonly projectsRepository: ProjectsRepository,
    @Inject(TARGETS_REPOSITORY)
    private readonly targetsRepository: TargetsRepository,
  ) {}

  async execute(query: ListTargetsQuery): Promise<TargetDto[]> {
    await resolveProjectInCallerWorkspace(
      this.workspacesRepository,
      this.projectsRepository,
      query.userId,
      query.projectId,
    );
    const targets = await this.targetsRepository.list({
      projectId: query.projectId,
      type: query.filter.type,
      scopeStatus: query.filter.scopeStatus,
      tagId: query.filter.tagId,
    });
    return targets.map(toTargetDto);
  }
}
