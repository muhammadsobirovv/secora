import { Module } from '@nestjs/common';
import { McpModule } from '../mcp/mcp.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { ScriptsModule } from '../scripts/scripts.module.js';
import { ObservabilityModule } from '../observability/observability.module.js';

import { AgentSdkRepository } from './agent-sdk.repository.js';
import { AgentSdkRegistryService } from './agent-sdk-registry.service.js';
import { AgentSdkRunnerService } from './agent-sdk-runner.service.js';
import { AgentSdkController } from './controllers/agent-sdk.controller.js';
import {
  RegisterAgentSdkDefinitionHandler,
  StartAgentSdkRunHandler,
} from './commands/agent-sdk.commands.js';
import {
  GetAgentSdkRunHandler,
  ListAgentSdkDefinitionsHandler,
  ListAgentSdkRunsHandler,
} from './queries/agent-sdk.queries.js';

/// Module 13 — AI Agent SDK (task #281) + the eleven built-in agents
/// (task #282). Imports `McpModule` for the in-process
/// `McpToolRegistryService`/`McpResourceRegistryService` built-in agents
/// call through (`LocalMcpContextAdapter`), `WorkspacesModule` for
/// the same personal-workspace resolution every other module's write
/// path uses, and `ScriptsModule` (task #286) so `AgentSdkRunnerService`
/// can run a `CUSTOM` agent's `sourceCode` through the Script Engine's
/// `node:vm` sandbox instead of the `AGENT_SDK_CUSTOM_EXECUTION_NOT_SUPPORTED`
/// stub.
@Module({
  imports: [McpModule, WorkspacesModule, ScriptsModule, ObservabilityModule],
  controllers: [AgentSdkController],
  providers: [
    AgentSdkRepository,
    AgentSdkRegistryService,
    AgentSdkRunnerService,
    RegisterAgentSdkDefinitionHandler,
    StartAgentSdkRunHandler,
    ListAgentSdkDefinitionsHandler,
    ListAgentSdkRunsHandler,
    GetAgentSdkRunHandler,
  ],
})
export class AgentSdkModule {}
