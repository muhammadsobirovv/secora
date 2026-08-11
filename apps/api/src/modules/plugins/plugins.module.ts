import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { PublishPluginHandler, PublishPluginVersionHandler, UpdatePluginHandler } from './commands/plugins.commands.js';
import {
  ExecutePluginHookHandler,
  InstallPluginHandler,
  UninstallPluginHandler,
  UpdatePluginInstallationHandler,
} from './commands/plugin-installations.commands.js';
import { RatePluginHandler } from './commands/plugin-ratings.commands.js';
import {
  GetPluginHandler,
  ListMarketplacePacksHandler,
  ListPluginRatingsHandler,
  ListPluginsHandler,
  ListWorkspacePluginCapabilitiesHandler,
} from './queries/plugins.query.js';
import {
  GetAvailablePluginUpdatesHandler,
  ListPluginInstallationsHandler,
} from './queries/plugin-installations.query.js';
import { PluginsController } from './controllers/plugins.controller.js';
import { PluginInstallationsController } from './controllers/plugin-installations.controller.js';
import { PluginSandboxService } from './plugin-sandbox.service.js';

const COMMAND_HANDLERS = [
  PublishPluginHandler,
  PublishPluginVersionHandler,
  UpdatePluginHandler,
  InstallPluginHandler,
  UpdatePluginInstallationHandler,
  UninstallPluginHandler,
  ExecutePluginHookHandler,
  RatePluginHandler,
];

const QUERY_HANDLERS = [
  ListPluginsHandler,
  GetPluginHandler,
  ListPluginRatingsHandler,
  ListPluginInstallationsHandler,
  // Module 13 — Plugin SDK (task #285)
  ListWorkspacePluginCapabilitiesHandler,
  // Module 13 — Automation Marketplace (task #287)
  ListMarketplacePacksHandler,
  // Module 14 — Auto Update (task #317)
  GetAvailablePluginUpdatesHandler,
];

/// Module 10 — Plugin Marketplace: registry (publish/version/update),
/// installation (dependency resolution + permission consent), sandboxed
/// execution (`PluginSandboxService`, Node `vm`), and ratings. Installs
/// publish `PluginInstalledEvent`/`PluginUninstalledEvent` onto the
/// existing CQRS `EventBus`, consumed by Module 2's
/// `ActivityRecordingHandler` (Activity Timeline integration) — see
/// events/plugin-events.ts. Imports `WorkspacesModule` (task #285) so
/// `ListWorkspacePluginCapabilitiesHandler` can resolve the caller's
/// personal workspace the same way every other module's write/read path
/// does.
@Module({
  imports: [WorkspacesModule],
  controllers: [PluginsController, PluginInstallationsController],
  providers: [...COMMAND_HANDLERS, ...QUERY_HANDLERS, PluginSandboxService],
})
export class PluginsModule {}
