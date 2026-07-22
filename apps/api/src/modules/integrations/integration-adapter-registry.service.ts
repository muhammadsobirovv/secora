import { Injectable } from '@nestjs/common';
import type { IntegrationCapabilityDto, IntegrationProvider } from '@pentesthub/shared';
import type { IntegrationAdapter } from './integration-adapter.interface.js';
import { GithubAdapter, GitlabAdapter, JiraAdapter, LinearAdapter } from './adapters/issue-tracker.adapters.js';
import { DiscordAdapter, MsTeamsAdapter, SlackAdapter, TelegramAdapter } from './adapters/messaging-adapters.js';
import { DropboxAdapter, GoogleDriveAdapter, NotionAdapter, ObsidianAdapter } from './adapters/docs-storage-adapters.js';
import { AwsAdapter, AzureAdapter, GcpAdapter } from './adapters/cloud-adapters.js';

/// Providers whose primary/preferred auth path is a standard OAuth2
/// authorization-code exchange (see oauth2-provider-config.ts for the
/// per-provider endpoint/scope config), scoped to exactly the providers
/// whose adapter consumes a plain bearer-style access token — the same
/// shape a completed OAuth exchange produces, so no credential-format
/// branch is needed downstream. GitHub/GitLab/Notion also accept a PAT
/// via the same header, so ConnectIntegrationCommand (direct token) and
/// CompleteOAuthConnectionCommand (exchanged token) both terminate in
/// the identical `IntegrationConnection.credentials` shape for these
/// providers. Discord and MS Teams have platform OAuth-app credentials
/// configured (env.validation.ts) reserved for a future bot-installation
/// flow, but v1's adapters for them are webhook-URL-based
/// (messaging-adapters.ts), which an OAuth access token cannot directly
/// satisfy — so they stay token/webhook-connect only for now, an
/// explicit, disclosed scope decision rather than a silent gap.
const OAUTH_PROVIDERS: ReadonlySet<IntegrationProvider> = new Set([
  'GITHUB',
  'GITLAB',
  'SLACK',
  'GOOGLE_DRIVE',
  'DROPBOX',
  'NOTION',
]);

/// Central provider -> adapter lookup, the single place that knows the
/// full set of 15 native integrations. Every adapter class is a plain
/// `@Injectable()` with no dependencies of its own (they only use the
/// built-in `fetch`/`crypto`), so Nest constructs one instance of each
/// and this registry just indexes them by `provider`.
@Injectable()
export class IntegrationAdapterRegistryService {
  private readonly adapters: Map<IntegrationProvider, IntegrationAdapter>;

  constructor(
    github: GithubAdapter,
    gitlab: GitlabAdapter,
    jira: JiraAdapter,
    linear: LinearAdapter,
    slack: SlackAdapter,
    discord: DiscordAdapter,
    msTeams: MsTeamsAdapter,
    telegram: TelegramAdapter,
    notion: NotionAdapter,
    obsidian: ObsidianAdapter,
    googleDrive: GoogleDriveAdapter,
    dropbox: DropboxAdapter,
    aws: AwsAdapter,
    azure: AzureAdapter,
    gcp: GcpAdapter,
  ) {
    const all: IntegrationAdapter[] = [
      github, gitlab, jira, linear, slack, discord, msTeams, telegram,
      notion, obsidian, googleDrive, dropbox, aws, azure, gcp,
    ];
    this.adapters = new Map(all.map((adapter) => [adapter.provider, adapter]));
  }

  get(provider: IntegrationProvider): IntegrationAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) throw new Error(`No adapter registered for integration provider "${provider}".`);
    return adapter;
  }

  isOAuthProvider(provider: IntegrationProvider): boolean {
    return OAUTH_PROVIDERS.has(provider);
  }

  listCapabilities(): IntegrationCapabilityDto[] {
    return [...this.adapters.values()]
      .map((adapter) => ({
        provider: adapter.provider,
        actions: adapter.actions,
        authMethod: (this.isOAuthProvider(adapter.provider) ? 'OAUTH2' : 'TOKEN') as 'OAUTH2' | 'TOKEN',
      }))
      .sort((a, b) => a.provider.localeCompare(b.provider));
  }
}
