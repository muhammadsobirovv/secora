import { HttpStatus, Inject } from '@nestjs/common';
import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { OrchestrationRunDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { AgentOrchestratorService } from '../orchestrator/agent-orchestrator.service.js';
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
export class GetOrchestrationRunQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly orchestrationRunId: string,
  ) {}
}

@QueryHandler(GetOrchestrationRunQuery)
export class GetOrchestrationRunHandler
  implements IQueryHandler<GetOrchestrationRunQuery, OrchestrationRunDto>
{
  constructor(
    private readonly orchestrator: AgentOrchestratorService,
    @Inject(AGENT_ORCHESTRATION_REPOSITORY)
    private readonly repository: AgentOrchestrationRepository,
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
  ) {}

  async execute(query: GetOrchestrationRunQuery): Promise<OrchestrationRunDto> {
    await resolveOrchestrationRunForCaller(
      this.repository,
      this.workspacesRepository,
      query.userId,
      query.orchestrationRunId,
    );
    const run = await this.orchestrator.getRun(query.orchestrationRunId);
    if (!run) {
      throw new AppException(
        'ORCHESTRATION_RUN_NOT_FOUND',
        'Orchestration run not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    return run;
  }
}
