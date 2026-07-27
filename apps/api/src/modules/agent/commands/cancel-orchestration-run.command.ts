import { Inject } from '@nestjs/common';
import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
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
export class CancelOrchestrationRunCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly orchestrationRunId: string,
  ) {}
}

@CommandHandler(CancelOrchestrationRunCommand)
export class CancelOrchestrationRunHandler
  implements ICommandHandler<CancelOrchestrationRunCommand, boolean>
{
  constructor(
    private readonly orchestrator: AgentOrchestratorService,
    @Inject(AGENT_ORCHESTRATION_REPOSITORY)
    private readonly repository: AgentOrchestrationRepository,
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
  ) {}

  async execute(command: CancelOrchestrationRunCommand): Promise<boolean> {
    await resolveOrchestrationRunForCaller(
      this.repository,
      this.workspacesRepository,
      command.userId,
      command.orchestrationRunId,
    );
    return this.orchestrator.cancel(command.orchestrationRunId);
  }
}
