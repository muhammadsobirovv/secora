import { Inject } from '@nestjs/common';
import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { ListOrchestrationRunsQueryDto, OrchestrationRunSummaryDto } from '@pentesthub/shared';
import {
  AGENT_ORCHESTRATION_REPOSITORY,
  type AgentOrchestrationRepository,
} from '../domain/repositories/agent-orchestration.repository.interface.js';
import { toOrchestrationRunSummaryDto } from '../mappers/to-orchestration-run-dto.mapper.js';
import {
  resolveWorkspaceForCaller,
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../agent-authorization.util.js';

/// Module 11 — Controllers + Swagger + module wiring + events (task #236).
export class ListOrchestrationRunsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly filter: ListOrchestrationRunsQueryDto,
  ) {}
}

@QueryHandler(ListOrchestrationRunsQuery)
export class ListOrchestrationRunsHandler
  implements IQueryHandler<ListOrchestrationRunsQuery, OrchestrationRunSummaryDto[]>
{
  constructor(
    @Inject(AGENT_ORCHESTRATION_REPOSITORY)
    private readonly repository: AgentOrchestrationRepository,
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
  ) {}

  async execute(query: ListOrchestrationRunsQuery): Promise<OrchestrationRunSummaryDto[]> {
    const workspace = await resolveWorkspaceForCaller(this.workspacesRepository, query.userId);
    const runs = await this.repository.listRuns({
      workspaceId: workspace.id,
      projectId: query.filter.projectId,
      status: query.filter.status,
      limit: query.filter.limit,
    });
    return Promise.all(
      runs.map(async (run) => {
        const tasks = await this.repository.listTasksForRun(run.id);
        return toOrchestrationRunSummaryDto(run, tasks);
      }),
    );
  }
}
