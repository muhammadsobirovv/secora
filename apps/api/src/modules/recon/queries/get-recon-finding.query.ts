import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject, HttpStatus } from '@nestjs/common';
import type { ReconFindingDto } from '@pentesthub/shared';
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

export class GetReconFindingQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly findingId: string,
  ) {}
}

@QueryHandler(GetReconFindingQuery)
export class GetReconFindingHandler implements IQueryHandler<
  GetReconFindingQuery,
  ReconFindingDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(RECON_FINDINGS_REPOSITORY)
    private readonly reconFindingsRepository: ReconFindingsRepository,
  ) {}

  async execute(query: GetReconFindingQuery): Promise<ReconFindingDto> {
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
    const finding = await this.reconFindingsRepository.findByIdForWorkspace(
      query.findingId,
      workspace.id,
    );
    if (!finding) {
      throw new AppException(
        'RECON_FINDING_NOT_FOUND',
        'Finding not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    return toReconFindingDto(finding);
  }
}
