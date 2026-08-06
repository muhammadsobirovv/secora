import { Module } from '@nestjs/common';
import { McpModule } from '../mcp/mcp.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { DeveloperPortalController } from './controllers/developer-portal.controller.js';

/// Module 13 — Developer Portal (task #291). Imports `McpModule` for the
/// three registries the catalog/try-it-out endpoints read/call through,
/// `WorkspacesModule` for personal-workspace resolution. Deliberately
/// registers no new CQRS handlers of its own — `usage` dispatches
/// `GetAiPlatformObservabilityQuery`, whose handler is already
/// registered by `ObservabilityModule` elsewhere in `AppModule`.
@Module({
  imports: [McpModule, WorkspacesModule],
  controllers: [DeveloperPortalController],
})
export class DeveloperPortalModule {}
