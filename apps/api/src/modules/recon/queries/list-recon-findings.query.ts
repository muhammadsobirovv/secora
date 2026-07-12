import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject, HttpStatus } from '@nestjs/common';
import type {
  ListReconFindingsQueryDto,
  ReconFindingDto,
} from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  RECON_FINDINGS_REPOSITORY,
  type ReconFindingsRepository,
} from '../domain/repositories/recon-findings.repository.interface.js';
import { toReconFindingDto } from '../mappers/to-recon-finding-dto.mapper.js';

export class ListReconFindingsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly filter: ListReconFindingsQueryDto,
  ) {}
}

@QueryHandler(ListReconFindingsQuery)
export class ListReconFindingsHandler implements IQueryHandler<
  ListReconFindingsQuery,
  ReconFindingDto[]
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(RECON_FINDINGS_REPOSITORY)
    private readonly reconFindingsRepository: ReconFindingsRepository,
  ) {}

  async execute(query: ListReconFindingsQuery): Promise<ReconFindingDto[]> {
    const workspace =
      await this.workspacesRepository.findPersonalWorkspaceForUser(
        query.userId,
      );
    if (!workspace) {
      throw new AppException(
        'WORKSPACE_NOT_FOUND',
        'Workspace not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    const findings = await this.reconFindingsRepository.list({
      workspaceId: workspace.id,
      targetId: query.filter.targetId,
      projectId: query.filter.projectId,
      jobId: query.filter.jobId,
      type: query.filter.type,
    });
    return findings.map(toReconFindingDto);
  