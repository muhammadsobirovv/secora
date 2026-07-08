import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import type { EvidenceDto } from '@pentesthub/shared';
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
import { resolveEvidenceForCaller } from '../commands/evidence-lifecycle.commands.js';
import { toEvidenceDto } from '../mappers/to-evidence-dto.mapper.js';

export class GetEvidenceQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly evidenceId: string,
  ) {}
}

@QueryHandler(GetEvidenceQuery)
export class GetEvidenceHandler implements IQueryHandler<
  GetEvidenceQuery,
  EvidenceDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROJECTS_REPOSITORY)
    private readonly projectsRepository: ProjectsRepository,
    @Inject(EVIDENCE_REPOSITORY)
    private readonly evidenceRepository: EvidenceRepository,
  ) {}

  async execute(query: GetEvidenceQuery): Promise<EvidenceDto> {
    const { evidence } = await resolveEvidenceForCaller(
      this.workspacesRepository,
      this.projectsRepository,
      this.evidenceRepository,
      query.userId,
      query.evidenceId,
    );
    return toEvidenceDto(evidence);
  }
}

export class ListEvidenceQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly projectId: string,
    public readonly targetId?: string,
  ) {}
}

@QueryHandler(ListEvidenceQuery)
export class ListEvidenceHandler implements IQueryHandler<
  ListEvidenceQuery,
  EvidenceDto[]
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROJECTS_REPOSITORY)
    private readonly projectsRepository: ProjectsRepository,
    @Inject(EVIDENCE_REPOSITORY)
    private readonly evidenceRepository: EvidenceRepository,
  ) {}

  async execute(query: ListEvidenceQuery): Promise<EvidenceDto[]> {
    await resolveProjectInCallerWorkspace(
      this.workspacesRepository,
      this.projectsRepository,
      query.userId,
      query.projectId,
    );
    const evidence = await this.evidenceRepository.list(
      query.projectId,
      query.targetId,
    );
    return evidence.map(toEvidenceDto);
  }
}
