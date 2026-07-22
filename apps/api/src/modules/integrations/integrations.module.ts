import { Module } from '@nestjs/common';
import { GithubAdapter, GitlabAdapter, JiraAdapter, LinearAdapter } from './adapters/issue-tracker.adapters.js';
import { DiscordAdapter, MsTeamsAdapter, SlackAdapter, TelegramAdapter } from './adapters/messaging-adapters.js';
import { DropboxAdapter, GoogleDriveAdapter, NotionAdapter, ObsidianAdapter } from './adapters/docs-storage-adapters.js';
import { AwsAdapter, AzureAdapter, GcpAdapter } from './adapters/cloud-adapters.js';
import { IntegrationAdapterRegistryService } from './integration-adapter-registry.service.js';
import {
  ConnectIntegrationHandler,
  DisconnectIntegrationHandler,
  TestIntegrationConnectionHandler,
  UpdateIntegrationConnectionHandler,
} from './commands/integration-connections.commands.js';
import { CompleteOAuthConnectionHandler, StartOAuthConnectionHandler } from './commands/integration-oauth.commands.js';
import { ExecuteIntegrationActionHandler } from './commands/integration-actions.commands.js';
import { ListIntegrationConnectionsHandler } from './queries/integration-connections.query.js';
import { IntegrationsController } from './controllers/integrations.controller.js';

const ADAPTERS = [
  GithubAdapter, GitlabAdapter, JiraAdapter, LinearAdapter,
  SlackAdapter, DiscordAdapter, MsTeamsAdapter, TelegramAdapter,
  NotionAdapter, ObsidianAdapter, GoogleDriveAdapter, DropboxAdapter,
  AwsAdapter, AzureAdapter, GcpAdapter,
];

const COMMAND_HANDLERS = [
  ConnectIntegrationHandler,
  UpdateIntegrationConnectionHandler,
  DisconnectIntegrationHandler,
  TestIntegrationConnectionHandler,
  StartOAuthConnectionHandler,
  CompleteOAuthConnectionHandler,
  ExecuteIntegrationActionHandler,
];

const QUERY_HANDLERS = [ListIntegrationConnectionsHandler];

/// Module 10 — Native Integrations: a common `IntegrationAdapter`
/// contract (`integration-adapter.interface.ts`) implemented by 15
/// real, `fetch()`-based provider adapters across 4 themed files
/// (issue trackers, messaging, docs/storage, cloud), a central
/// `IntegrationAdapterRegistryService` provider->adapter lookup, both
/// token/PAT connect and OAuth2 authorization-code connect
/// (oauth-exchange.util.ts), and org-scoped connection management +
/// action execution. Every connection is optional (BYOK-style, same
/// posture as Module 5's AI provider credentials and Module 10's Plugin
/// Marketplace) — nothing in Modules 1-9 requires an integration to
/// exist.
@Module({
  controllers: [IntegrationsController],
  providers: [...ADAPTERS, IntegrationAdapterRegistryService, ...COMMAND_HANDLERS, ...QUERY_HANDLERS],
})
export class IntegrationsModule {}
