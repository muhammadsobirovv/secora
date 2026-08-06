import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus, Inject } from '@nestjs/common';
import type { AgentSdkDefinitionDto, AgentSdkRunDto, RegisterAgentSdkDefinitionRequestDto, StartAgentSdkRunRequestDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import { AgentSdkRegistryService } from '../agent-sdk-registry.service.js';
import { AgentSdkRunnerService } from '../agent-sdk-runner.service.js';

/// Module 13 — AI Agent SDK commands (task #281). Thin CQRS wrappers
/// around `AgentSdkRegistryService`/`AgentSdkRunnerService` — same
/// "controller -> Command -> resolve workspace -> service" shape as
/// every other module's write path (e.g.
/// `create-prompt-template.command.ts`), so `AgentSdkController` never
/// injects a repository directly.

async function resolveWorkspaceId(workspacesRepository: WorkspacesRepository, userId: string): Promise<string> {
  const workspace = await workspacesRepository.findPersonalWorkspaceForUser(userId);
  if (!workspace) {
    throw new AppException('WORKSPACE_NOT_FOUND', 'Workspace not found.', HttpStatus.NOT_FOUND);
  }
  return workspace.id;
}

export class RegisterAgentSdkDefinitionCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly data: RegisterAgentSdkDefinitionRequestDto,
  ) {}
}

@CommandHandler(RegisterAgentSdkDefinitionCommand)
export class RegisterAgentSdkDefinitionHandler implements ICommandHandler<RegisterAgentSdkDefinitionCommand, AgentSdkDefinitionDto> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY) private readonly workspacesRepository: WorkspacesRepository,
    private readonly registry: AgentSdkRegistryService,
  ) {}

  async execute(command: RegisterAgentSdkDefinitionCommand): Promise<AgentSdkDefinitionDto> {
    const workspaceId = await resolveWorkspaceId(this.workspacesRepository, command.userId);
    return this.registry.register(workspaceId, command.userId, command.data);
  }
}

export class StartAgentSdkRunCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly data: StartAgentSdkRunRequestDto,
  ) {}
}

@CommandHandler(StartAgentSdkRunCommand)
export class StartAgentSdkRunHandler implements ICommandHandler<StartAgentSdkRunCommand, AgentSdkRunDto> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY) private readonly workspacesRepository: WorkspacesRepository,
    private readonly runner: AgentSdkRunnerService,
  ) {}

  async execute(command: StartAgentSdkRunCommand): Promise<AgentSdkRunDto> {
    const workspaceId = await resolveWorkspaceId(this.workspacesRepository, command.userId);
    return this.runner.startRun({
      workspaceId,
      userId: command.userId,
      agentSdkDefinitionId: command.data.agentSdkDefinitionId,
      projectId: command.data.projectId,
      input: command.data.input,
    });
  }
}

export { resolveWorkspaceId };
