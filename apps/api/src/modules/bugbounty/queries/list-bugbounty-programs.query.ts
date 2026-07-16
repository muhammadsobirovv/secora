import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import type {
  BugBountyProgramDto,
  ListBugBountyProgramsQueryDto,
} from '@pentesthub/shared';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  BUGBOUNTY_PROGRAMS_REPOSITORY,
  type BugBountyProgramsRepository,
} from '../domain/repositories/bugbounty-programs.repository.interface.js';
import {
  BUGBOUNTY_FINDINGS_REPOSITORY,
  type BugBountyFindingsRepository,
} from '../domain/repositories/bugbounty-findings.repository.interface.js';
import { resolveWorkspaceForCaller } from '../authorization.util.js';
import { toBugBountyProgramDto } from '../mappers/to-bugbounty-program-dto.mapper.js';

export class ListBugBountyProgramsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly filter: ListBugBountyProgramsQueryDto,
  ) {}
}

@QueryHandler(ListBugBountyProgramsQuery)
export class ListBugBountyProgramsHandler implements IQueryHandler<
  ListBugBountyProgramsQuery,
  BugBountyProgramDto[]
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(BUGBOUNTY_PROGRAMS_REPOSITORY)
    private readonly programsRepository: BugBountyProgramsRepository,
    @Inject(BUGBOUNTY_FINDINGS_REPOSITORY)
    private readonly findingsRepository: BugBountyFindingsRepository,
  ) {}

  async execute(
    query: ListBugBountyProgramsQuery,
  ): Promise<BugBountyProgramDto[]> {
    const workspace = await resolveWorkspaceForCaller(
      this.workspacesRepository,
      query.userId,
    );

    const programs = await this.programsRepository.list({
      workspaceId: workspace.id,
      projectId: query.filter.projectId,
      platform: query.filter.platform,
      status: query.filter.status,
      search: query.filter.search,
    });

    return Promise.all(
      programs.map(async (program) => {
        const [scopeItemCount, targetCount, findings] = await Promise.all([
          this.programsRepository.countScopeItems(program.id),
          this.programsRepository.countLinkedTargets(program.id),
          this.findingsRepository.list({
            workspaceId: workspace.id,
            programId: program.id,
            limit: 500,
          }),
        ]);
        return toBugBountyProgramDto(program, {
          scopeItemCount,
          targetCount,
          findingCount: findings.length,
        });
      }),
    );
  