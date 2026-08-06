import { HttpStatus, Inject } from '@nestjs/common';
import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { EvaluationRunDto, EvaluationSummaryDto, ListEvaluationRunsQueryDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import { AiEvaluationService } from '../ai-evaluation.service.js';

export class ListEvaluationRunsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly filter: ListEvaluationRunsQueryDto,
  ) {}
}

@QueryHandler(ListEvaluationRunsQuery)
export class ListEvaluationRunsHandler implements IQueryHandler<ListEvaluationRunsQuery, EvaluationRunDto[]> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY) private readonly workspacesRepository: WorkspacesRepository,
    private readonly evaluationService: AiEvaluationService,
  ) {}

  async execute(query: ListEvaluationRunsQuery): Promise<EvaluationRunDto[]> {
    const workspace = await this.workspacesRepository.findPersonalWorkspaceForUser(query.userId);
    if (!workspace) {
      throw new AppException('WORKSPACE_NOT_FOUND', 'Workspace not found.', HttpStatus.NOT_FOUND);
    }
    return this.evaluationService.list({ workspaceId: workspace.id, ...query.filter });
  }
}

export class GetEvaluationSummaryQuery implements IQuery {
  constructor(public readonly userId: string) {}
}

@QueryHandler(GetEvaluationSummaryQuery)
export class GetEvaluationSummaryHandler implements IQueryHandler<GetEvaluationSummaryQuery, EvaluationSummaryDto[]> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY) private readonly workspacesRepository: WorkspacesRepository,
    private readonly evaluationService: AiEvaluationService,
  ) {}

  async execute(query: GetEvaluationSummaryQuery): Promise<EvaluationSummaryDto[]> {
    const workspace = await this.workspacesRepository.findPersonalWorkspaceForUser(query.userId);
    if (!workspace) {
      throw new AppException('WORKSPACE_NOT_FOUND', 'Workspace not found.', HttpStatus.NOT_FOUND);
    }
    return this.evaluationService.summary(workspace.id);
  }
}
