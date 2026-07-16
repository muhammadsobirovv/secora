import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import type { BugBountyProgramDetailDto } from '@pentesthub/shared';
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
import { resolveBugBountyProgramForCaller } from '../authorization.util.js';
import { toBugBountyProgramDto } from '../mappers/to-bugbounty-program-dto.mapper.js';

export class GetBugBountyProgramQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly programId: string,
  ) {}
}

@QueryHandler(GetBugBountyProgramQuery)
export class GetBugBountyProgramHandler implements IQueryHandler<
  GetBugBountyProgramQuery,
  BugBountyProgramDetailDto
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
    query: GetBugBountyProgramQuery,
  ): Promise<BugBountyProgramDetailDto> {
    const { workspaceId, program } = await resolveBugBountyProgramForCaller(
      this.workspacesRepository,
      this.programsRepository,
      query.userId,
      query.programId,
    );

    const [scopeItems, targetIds, findings] = await Promise.all([
      this.programsRepository.listScopeItems(program.id),
      this.programsRepository.listLinkedTargetIds(program.id),
      this.findingsRepository.list({
        workspaceId,
        programId: program.id,
        limit: 500,
      }),
    ]);

    const dto = toBugBountyProgramDto(program, {
      scopeItemCount: scopeItems.length,
      targetCount: targetIds.length,
      findingCount: findings.length,
    });

    return {
      ...dto,
      scopeItems: scopeItems.map((item) => ({
        id: item.id,
        programId: item.programId,
        type: item.type,
        pattern: item.pattern,
        classification: item.classification,
        notes: item.notes,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
      targetIds,
    };
  