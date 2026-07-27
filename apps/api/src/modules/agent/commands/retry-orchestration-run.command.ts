import { Inject } from '@nestjs/common';
import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import type { OrchestrationRunDto } from '@pentesthub/shared';
import {
  AGENT_ORCHESTRATION_REPOSITORY,
  type AgentOrchestrationRepository,
} from '../domain/repositories/agent-orchestration.repository.interface.js';
import { AgentOrchestratorService } from '../orchestrator/agent-orchestrator.service.js';
import {
  resolveOrchestrationRunForCaller,
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../agent-authorization.util.js';

/// Module 11 — Controllers + Swagger + module wiring + events (task #236).
export class RetryOrchestrationRunCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly orchestrationRunId: string,
  ) {}
}

@CommandHandler(RetryOrchestrationRunCommand)
export class RetryOrchestrationRunHandler
  implements ICommandHandler<RetryOrchestrationRunCommand, OrchestrationRunDto | null>
{
  constructor(
    private readonly orchestrator: AgentOrchestratorService,
    @Inject(AGENT_ORCHESTRATION_REPOSITORY)
    private readonly repository: AgentOrchestrationRepository,
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
  ) {}

  async execute(command: RetryOrchestrationRunCommand): Promise<OrchestrationRunDto | null> {
    await resolveOrchestrationRunForCaller(
      this.repository,
      this.workspacesRepository,
      command.userId,
      command.orchestrationRunId,
    );
    return this.orchestrator.retry(command.orchestrationRunId);
  }
}
