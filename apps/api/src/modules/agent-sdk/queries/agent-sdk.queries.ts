import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { HttpStatus, Inject } from '@nestjs/common';
import type { AgentSdkDefinitionDto, AgentSdkRunDto, AgentSdkRunStatus } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import { AgentSdkRegistryService } from '../agent-sdk-registry.service.js';
import { AgentSdkRunnerService } from '../agent-sdk-runner.service.js';
import { resolveWorkspaceId } from '../commands/agent-sdk.commands.js';

export class ListAgentSdkDefinitionsQuery implements IQuery {
  constructor(public readonly userId: string) {}
}

@QueryHandler(ListAgentSdkDefinitionsQuery)
export class ListAgentSdkDefinitionsHandler implements IQueryHandler<ListAgentSdkDefinitionsQuery, AgentSdkDefinitionDto[]> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY) private readonly workspacesRepository: WorkspacesRepository,
    private readonly registry: AgentSdkRegistryService,
  ) {}

  async execute(query: ListAgentSdkDefinitionsQuery): Promise<AgentSdkDefinitionDto[]> {
    const workspaceId = await resolveWorkspaceId(this.workspacesRepository, query.userId);
    return this.registry.list(workspaceId);
  }
}

export class ListAgentSdkRunsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly filter: { agentSdkDefinitionId?: string; status?: AgentSdkRunStatus; limit?: number },
  ) {}
}

@QueryHandler(ListAgentSdkRunsQuery)
export class ListAgentSdkRunsHandler implements IQueryHandler<ListAgentSdkRunsQuery, AgentSdkRunDto[]> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY) private readonly workspacesRepository: WorkspacesRepository,
    private readonly runner: AgentSdkRunnerService,
  ) {}

  async execute(query: ListAgentSdkRunsQuery): Promise<AgentSdkRunDto[]> {
    const workspaceId = await resolveWorkspaceId(this.workspacesRepository, query.userId);
    return this.runner.listRuns({ workspaceId, ...query.filter });
  }
}

export class GetAgentSdkRunQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly runId: string,
  ) {}
}

@QueryHandler(GetAgentSdkRunQuery)
export class GetAgentSdkRunHandler implements IQueryHandler<GetAgentSdkRunQuery, AgentSdkRunDto> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY) private readonly workspacesRepository: WorkspacesRepository,
    private readonly runner: AgentSdkRunnerService,
  ) {}

  async execute(query: GetAgentSdkRunQuery): Promise<AgentSdkRunDto> {
    const workspaceId = await resolveWorkspaceId(this.workspacesRepository, query.userId);
    const run = await this.runner.getRun(query.runId);
    if (!run || run.workspaceId !== workspaceId) {
      throw new AppException('AGENT_SDK_RUN_NOT_FOUND', 'Agent run not found.', HttpStatus.NOT_FOUND);
    }
    return run;
  }
}
