import { Module } from '@nestjs/common';
import { McpModule } from '../mcp/mcp.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { ObservabilityModule } from '../observability/observability.module.js';
import { ScriptsRepository } from './scripts.repository.js';
import { ScriptEngineService } from './script-engine.service.js';
import { ScriptsController } from './controllers/scripts.controller.js';
import {
  CreateScriptDefinitionHandler,
  DeleteScriptDefinitionHandler,
  RunScriptHandler,
  UpdateScriptDefinitionHandler,
} from './commands/scripts.commands.js';
import {
  GetScriptDefinitionHandler,
  GetScriptExecutionHandler,
  ListScriptDefinitionsHandler,
  ListScriptExecutionsHandler,
} from './queries/scripts.queries.js';

/// Module 13 — Script Engine (task #286). Imports `McpModule` for the
/// in-process `McpToolRegistryService`/`McpResourceRegistryService`
/// `ScriptEngineService` runs scripts against (via the same
/// `LocalMcpContextAdapter` the AI Agent SDK uses), and `WorkspacesModule`
/// for personal-workspace resolution.
@Module({
  imports: [McpModule, WorkspacesModule, ObservabilityModule],
  controllers: [ScriptsController],
  providers: [
    ScriptsRepository,
    ScriptEngineService,
    CreateScriptDefinitionHandler,
    UpdateScriptDefinitionHandler,
    DeleteScriptDefinitionHandler,
    RunScriptHandler,
    ListScriptDefinitionsHandler,
    GetScriptDefinitionHandler,
    ListScriptExecutionsHandler,
    GetScriptExecutionHandler,
  ],
  // `ScriptEngineService` is exported so `AgentSdkModule` can run a
  // CUSTOM agent's `sourceCode` through the same sandbox (see
  // `AgentSdkRunnerService`'s doc comment) without re-implementing it.
  exports: [ScriptEngineService],
})
export class ScriptsModule {}
