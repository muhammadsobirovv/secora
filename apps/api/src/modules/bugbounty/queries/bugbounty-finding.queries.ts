import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import type {
  BugBountyFindingDto,
  ListBugBountyFindingsQueryDto,
} from '@pentesthub/shared';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  BUGBOUNTY_FINDINGS_REPOSITORY,
  type BugBountyFindingsRepository,
} from '../domain/repositories/bugbounty-findings.repository.interface.js';
import {
  resolveBugBountyFindingForCaller,
  resolveWorkspaceForCaller,
} from '../authorization.util.js';
import { toBugBountyFindingDto } from '../mappers/to-bugbounty-finding-dto.mapper.js';

export class ListBugBountyFindingsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly filter: ListBugBountyFindingsQueryDto,
  ) {}
}

@QueryHandler(ListBugBountyFindingsQuery)
export class ListBugBountyFindingsHandler implements IQueryHandler<
  ListBugBountyFindingsQuery,
  BugBountyFindingDto[]
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(BUGBOUNTY_FINDINGS_REPOSITORY)
    private readonly findingsRepository: BugBountyFindingsRepository,
  ) {}

  async execute(
    query: ListBugBountyFindingsQuery,
  ): Promise<BugBountyFindingDto[]> {
    const workspace = await resolveWorkspaceForCaller(
      this.workspacesRepository,
      query.userId,
    );

    const findings = await this.findingsRepository.list({
      workspaceId: workspace.id,
      programId: query.filter.programId,
      projectId: query.filter.projectId,
      targetId: query.filter.targetId,
      stage: query.filter.stage,
      severity: query.filter.severity,
      search: query.filter.search,
    });

    return Promise.all(
      findings.map(async (finding) => {
        const evidenceIds = await this.findingsRepository.listEvidenceIds(
          finding.id,
        );
        return toBugBountyFindingDto(finding, evidenceIds);
      }),
    );
  }
}

export class GetBugBountyFindingQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly findingId: string,
  ) {}
}

@QueryHandler(GetBugBountyFindingQuery)
export class GetBugBountyFindingHandler implements IQueryHandler<
  GetBugBountyFindingQuery,
  BugBountyFindingDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(BUGBOUNTY_FINDINGS_REPOSITORY)
    private readonly findingsRepository: BugBountyFindingsRepository,
  ) {}

  async execute(query: GetBugBountyFindingQuery): Promise<BugBountyFindingDto> {
    const { finding } = await resolveBugBountyFindingForCaller(
      this.workspacesRepository,
      this.findingsRepository,
      query.userId,
      query.findingId,
    );
    const evidenceIds = await this.findingsRepository.listEvidenceIds(
      finding.id,
    );
    return toBugBoun