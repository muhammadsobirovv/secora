import { Inject } from '@nestjs/common';
import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import type { CreateOrchestrationRunRequestDto, OrchestrationRunDto } from '@pentesthub/shared';
import { AgentOrchestratorService } from '../orchestrator/agent-orchestrator.service.js';
import {
  resolveWorkspaceForCaller,
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../agent-authorization.util.js';

/// Module 11 — Controllers + Swagger + module wiring + events (task #236).
/// First CQRS wrapper for the orchestration domain — AgentOrchestratorService
/// was previously only reachable via direct injection (WorkflowExecutorService).
export class StartOrchestrationRunCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly data: CreateOrchestrationRunRequestDto,
  ) {}
}

@CommandHandler(StartOrchestrationRunCommand)
export class StartOrchestrationRunHandler
  implements ICommandHandler<StartOrchestrationRunCommand, OrchestrationRunDto>
{
  constructor(
    private readonly orchestrator: AgentOrchestratorService,
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
  ) {}

  async execute(command: StartOrchestrationRunCommand): Promise<OrchestrationRunDto> {
    const workspace = await resolveWorkspaceForCaller(this.workspacesRepository, command.userId);
    return this.orchestrator.startRun({
      workspaceId: workspace.id,
      projectId: command.data.projectId ?? null,
      userId: command.userId,
      goal: command.data.goal,
    });
  }
}
