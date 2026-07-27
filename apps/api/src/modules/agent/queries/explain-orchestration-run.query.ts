import { HttpStatus, Inject } from '@nestjs/common';
import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { OrchestrationExplanationDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { AgentExplainabilityService } from '../explainability/agent-explainability.service.js';
import {
  resolveOrchestrationRunForCaller,
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../agent-authorization.util.js';
import {
  AGENT_ORCHESTRATION_REPOSITORY,
  type AgentOrchestrationRepository,
} from '../domain/repositories/agent-orchestration.repository.interface.js';

/// Module 11 — Controllers + Swagger + module wiring + events (task #236).
/// HTTP surface for AgentExplainabilityService (task #233), which
/// previously had no consumer at all outside this module.
export class ExplainOrchestrationRunQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly orchestrationRunId: string,
  ) {}
}

@QueryHandler(ExplainOrchestrationRunQuery)
export class ExplainOrchestrationRunHandler
  implements IQueryHandler<ExplainOrchestrationRunQuery, OrchestrationExplanationDto>
{
  constructor(
    private readonly explainability: AgentExplainabilityService,
    @Inject(AGENT_ORCHESTRATION_REPOSITORY)
    private readonly repository: AgentOrchestrationRepository,
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
  ) {}

  async execute(query: ExplainOrchestrationRunQuery): Promise<OrchestrationExplanationDto> {
    await resolveOrchestrationRunForCaller(
      this.repository,
      this.workspacesRepository,
      query.userId,
      query.orchestrationRunId,
    );
    const explanation = await this.explainability.explainRun(query.orchestrationRunId);
    if (!explanation) {
      throw new AppException(
        'ORCHESTRATION_RUN_NOT_FOUND',
        'Orchestration run not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    return explanation;
  }
}
