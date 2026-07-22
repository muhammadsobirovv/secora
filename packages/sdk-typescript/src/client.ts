import type { AuthTokensDto } from '@pentesthub/shared';
import { HttpClient, type HttpClientOptions } from './http-client.js';
import { AuthResource } from './resources/auth.resource.js';
import { OrganizationsResource } from './resources/organizations.resource.js';
import { DistributedJobsResource } from './resources/distributed-jobs.resource.js';
import { PluginsResource } from './resources/plugins.resource.js';
import { IntegrationsResource } from './resources/integrations.resource.js';

/// The official PentestHub AI SDK entrypoint.
///
/// ```ts
/// import { PentestHubClient } from '@pentesthub/sdk';
///
/// const client = new PentestHubClient({ baseUrl: 'https://api.your-company.com' });
/// await client.auth.login({ email, password });
/// const orgs = await client.organizations.list();
/// const jobs = await client.distributedJobs.list(orgs[0].id);
/// ```
///
/// v1 scope covers Auth, Organizations, Distributed Jobs, the Plugin
/// registry/installations, and Integrations — the same disclosed subset
/// the GraphQL API's v1 covers (`graphql-api.types.ts`), not the full
/// ~250-route REST surface. Every resource method is a thin, typed
/// wrapper around one REST call using the exact same
/// `@pentesthub/shared` endpoint-builder constants and DTO types the
/// server itself is built from, so the SDK can never silently drift from
/// the API it targets.
export class PentestHubClient {
  private readonly http: HttpClient;

  readonly auth: AuthResource;
  readonly organizations: OrganizationsResource;
  readonly distributedJobs: DistributedJobsResource;
  readonly plugins: PluginsResource;
  readonly integrations: IntegrationsResource;

  constructor(options: HttpClientOptions) {
    this.http = new HttpClient(options);
    this.auth = new AuthResource(this.http, (tokens: AuthTokensDto) => {
      this.http.setAccessToken(tokens.accessToken);
      options.onTokenRefreshed?.(tokens.accessToken);
    });
    this.organizations = new OrganizationsResource(this.http);
    this.distributedJobs = new DistributedJobsResource(this.http);
    this.plugins = new PluginsResource(this.http);
    this.integrations = new IntegrationsResource(this.http);
  }

  /// Directly set/replace the access token in use (e.g. after restoring
  /// a session from storage) without going through `auth.login()`.
  setAccessToken(accessToken: string): void {
    this.http.setAccessToken(accessToken);
  }
}
