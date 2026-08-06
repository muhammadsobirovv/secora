import { Module } from '@nestjs/common';
import { AiCoreModule } from '../ai/ai-core.module.js';
import { PublicApiModule } from '../public-api/public-api.module.js';
import { ObservabilityModule } from '../observability/observability.module.js';

import { McpSessionRepository } from './mcp-session.repository.js';
import { McpResourceRegistryService } from './mcp-resource-registry.service.js';
import { McpToolRegistryService } from './mcp-tool-registry.service.js';
import { McpPromptRegistryService } from './mcp-prompt-registry.service.js';
import { McpRpcDispatcherService } from './mcp-rpc-dispatcher.service.js';
import { McpSessionCleanupService } from './mcp-session-cleanup.service.js';
import { McpRpcController } from './controllers/mcp-rpc.controller.js';
import { McpSessionsController } from './controllers/mcp-sessions.controller.js';

/// Module 13 — MCP Server core (task #276) + Resources (#278) + Tools
/// (#279) + Prompt Registry-over-MCP + Observability wiring. Imports
/// `AiCoreModule` for `AiProviderRegistryService` (the `ask_ai`/
/// `generate_payload` tools) and `PublicApiModule` for `ApiKeyAuthGuard`
/// (the same X-API-Key auth every other machine-facing route in this
/// codebase uses — Module 9). Every CommandBus/QueryBus dispatch target
/// `McpToolRegistryService` calls (`CreateProjectCommand`,
/// `CreateReconJobCommand`, etc.) is registered as a handler by its own
/// owning module elsewhere in `AppModule` — this module never
/// re-registers those handlers, only imports the Command/Query *classes*
/// themselves (see each `import` at the top of that file).
@Module({
  imports: [AiCoreModule, PublicApiModule, ObservabilityModule],
  controllers: [McpRpcController, McpSessionsController],
  providers: [
    McpSessionRepository,
    McpResourceRegistryService,
    McpToolRegistryService,
    McpPromptRegistryService,
    McpRpcDispatcherService,
    McpSessionCleanupService,
  ],
  // McpToolRegistryService/McpResourceRegistryService are also the
  // in-process backend the AI Agent SDK's built-in agents call through
  // (see agent-sdk/local-mcp-context.adapter.ts, task #281) — exported
  // so AgentSdkModule can inject them without a second HTTP hop back
  // into this same server.
  // Module 13 — Developer Portal (task #291) also needs the Prompt
  // Registry's `list()`/`get()` to round out its read-only catalog
  // endpoint alongside tools/resources.
  exports: [McpToolRegistryService, McpResourceRegistryService, McpPromptRegistryService],
})
export class McpModule {}
