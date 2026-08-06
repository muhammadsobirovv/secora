import { QueryHandler, IQuery, IQueryHandler } from '@nestjs/cqrs';
import { HttpStatus, Inject } from '@nestjs/common';
import type { AiPlatformObservabilityDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import { AiPlatformObservabilityRepository } from '../ai-platform-observability.repository.js';

const DEFAULT_SINCE_DAYS = 7;

/// Module 13 — AI Automation Platform Observability (task #290). Same
/// "controller -> Query -> resolve personal workspace -> repository"
/// shape every other Module 13 read path uses. Fires all six
/// aggregations concurrently — they're independent read-only queries
/// against disjoint tables, no reason to serialize them.
export class GetAiPlatformObservabilityQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly sinceDays?: number,
  ) {}
}

@QueryHandler(GetAiPlatformObservabilityQuery)
export class GetAiPlatformObservabilityHandler
  implements IQueryHandler<GetAiPlatformObservabilityQuery, AiPlatformObservabilityDto>
{
  constructor(
    @Inject(WORKSPACES_REPOSITORY) private readonly workspacesRepository: WorkspacesRepository,
    private readonly repository: AiPlatformObservabilityRepository,
  ) {}

  async execute(query: GetAiPlatformObservabilityQuery): Promise<AiPlatformObservabilityDto> {
    const workspace = await this.workspacesRepository.findPersonalWorkspaceForUser(query.userId);
    if (!workspace) {
      throw new AppException('WORKSPACE_NOT_FOUND', 'Workspace not found.', HttpStatus.NOT_FOUND);
    }
    const sinceDays = query.sinceDays && query.sinceDays > 0 ? query.sinceDays : DEFAULT_SINCE_DAYS;

    const [mcpToolUsage, agentSdkRuns, scriptExecutions, workflowRuns, relayCommandQueue, evaluationRuns] =
      await Promise.all([
        this.repository.mcpToolUsage(workspace.id, sinceDays),
        this.repository.agentSdkRunsSummary(workspace.id, sinceDays),
        this.repository.scriptExecutionsSummary(workspace.id, sinceDays),
        this.repository.workflowRunsSummary(workspace.id, sinceDays),
        this.repository.relayCommandQueueSummary(workspace.id),
        this.repository.evaluationRunsSummary(workspace.id, sinceDays),
      ]);

    return {
      workspaceId: workspace.id,
      sinceDays,
      generatedAt: new Date().toISOString(),
      mcpToolUsage,
      agentSdkRuns,
      scriptExecutions,
      workflowRuns,
      relayCommandQueue,
      evaluationRuns,
    };
  }
}
