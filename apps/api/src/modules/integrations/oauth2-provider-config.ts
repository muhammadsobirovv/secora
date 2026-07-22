import type { ConfigService } from '@nestjs/config';
import type { IntegrationProvider } from '@pentesthub/shared';
import type { EnvConfig } from '../../config/env.validation.js';

export interface OAuth2ProviderConfig {
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  /// Some providers (Slack) want extra fixed params on the authorize URL
  /// (`user_scope`, response format); Notion wants `owner=user`.
  extraAuthorizeParams?: Record<string, string>;
  /// How to pull the usable access token out of the token endpoint's
  /// JSON response — almost always `response.access_token`, but Slack's
  /// OAuth v2 puts the bot token at `response.access_token` too (v2 flow)
  /// while the legacy v1 flow nested it; documented per-provider so a
  /// future provider with a different shape doesn't have to change the
  /// shared exchange function.
  extractAccessToken: (response: Record<string, unknown>) => string | null;
}

/// Per-provider OAuth2 authorization-code flow configuration. Only the
/// 6 providers in `IntegrationAdapterRegistryService`'s `OAUTH_PROVIDERS`
/// set are listed here — every provider not present falls back to
/// token/PAT connect (`ConnectIntegrationCommand`), which is a strictly
/// non-fatal, disclosed v1 scope decision (see registry comment).
export function getOAuth2ProviderConfig(provider: IntegrationProvider): OAuth2ProviderConfig | null {
  switch (provider) {
    case 'GITHUB':
      return {
        authorizeUrl: 'https://github.com/login/oauth/authorize',
        tokenUrl: 'https://github.com/login/oauth/access_token',
        scope: 'repo',
        extractAccessToken: (r) => (typeof r.access_token === 'string' ? r.access_token : null),
      };
    case 'GITLAB':
      return {
        authorizeUrl: 'https://gitlab.com/oauth/authorize',
        tokenUrl: 'https://gitlab.com/oauth/token',
        scope: 'api',
        extractAccessToken: (r) => (typeof r.access_token === 'string' ? r.access_token : null),
      };
    case 'SLACK':
      return {
        authorizeUrl: 'https://slack.com/oauth/v2/authorize',
        tokenUrl: 'https://slack.com/api/oauth.v2.access',
        scope: 'chat:write,channels:read',
        // Slack OAuth v2 returns the bot token at the top-level
        // `access_token` field (distinct from the legacy v1
        // `bot.bot_access_token` nesting) — the modern, currently-
        // documented shape.
        extractAccessToken: (r) => (typeof r.access_token === 'string' ? r.access_token : null),
      };
    case 'GOOGLE_DRIVE':
      return {
        authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        scope: 'https://www.googleapis.com/auth/drive.file',
        extraAuthorizeParams: { access_type: 'offline', prompt: 'consent' },
        extractAccessToken: (r) => (typeof r.access_token === 'string' ? r.access_token : null),
      };
    case 'DROPBOX':
      return {
        authorizeUrl: 'https://www.dropbox.com/oauth2/authorize',
        tokenUrl: 'https://api.dropboxapi.com/oauth2/token',
        scope: 'files.content.write files.content.read',
        extractAccessToken: (r) => (typeof r.access_token === 'string' ? r.access_token : null),
      };
    case 'NOTION':
      return {
        authorizeUrl: 'https://api.notion.com/v1/oauth/authorize',
        tokenUrl: 'https://api.notion.com/v1/oauth/token',
        scope: '',
        extraAuthorizeParams: { owner: 'user' },
        extractAccessToken: (r) => (typeof r.access_token === 'string' ? r.access_token : null),
      };
    default:
      return null;
  }
}

/// Resolves the platform's own OAuth-app client id/secret for a given
/// provider directly against literal `EnvConfig` keys (rather than
/// storing `keyof EnvConfig` on `OAuth2ProviderConfig` and indexing
/// generically) — every `ConfigService.get(...)` call below uses a
/// string literal, so each call is checked against `EnvConfig`
/// individually by the compiler instead of through a widened
/// `keyof EnvConfig` union, which is both simpler and eliminates an
/// entire class of "does this generic key resolve to the right field
/// type" type-inference risk.
export function getOAuthClientCredentials(
  configService: ConfigService<EnvConfig, true>,
  provider: IntegrationProvider,
): { clientId: string | undefined; clientSecret: string | undefined } {
  switch (provider) {
    case 'GITHUB':
      return {
        clientId: configService.get('INTEGRATION_GITHUB_CLIENT_ID', { infer: true }),
        clientSecret: configService.get('INTEGRATION_GITHUB_CLIENT_SECRET', { infer: true }),
      };
    case 'GITLAB':
      return {
        clientId: configService.get('INTEGRATION_GITLAB_CLIENT_ID', { infer: true }),
        clientSecret: configService.get('INTEGRATION_GITLAB_CLIENT_SECRET', { infer: true }),
      };
    case 'SLACK':
      return {
        clientId: configService.get('INTEGRATION_SLACK_CLIENT_ID', { infer: true }),
        clientSecret: configService.get('INTEGRATION_SLACK_CLIENT_SECRET', { infer: true }),
      };
    case 'GOOGLE_DRIVE':
      return {
        clientId: configService.get('INTEGRATION_GOOGLE_CLIENT_ID', { infer: true }),
        clientSecret: configService.get('INTEGRATION_GOOGLE_CLIENT_SECRET', { infer: true }),
      };
    case 'DROPBOX':
      return {
        clientId: configService.get('INTEGRATION_DROPBOX_CLIENT_ID', { infer: true }),
        clientSecret: configService.get('INTEGRATION_DROPBOX_CLIENT_SECRET', { infer: true }),
      };
    case 'NOTION':
      return {
        clientId: configService.get('INTEGRATION_NOTION_CLIENT_ID', { infer: true }),
        clientSecret: configService.get('INTEGRATION_NOTION_CLIENT_SECRET', { infer: true }),
      };
    default:
      return { clientId: undefined, clientSecret: undefined };
  }
}
