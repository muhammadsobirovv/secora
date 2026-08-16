import type { AuthTokensDto } from '@pentesthub/shared';
import { HttpClient, type HttpClientOptions } from './http-client.js';
import { AuthResource } from './resources/auth.resource.js';
import { OrganizationsResource } from './resources/organizations.resource.js';
import { DistributedJobsResource } from './resources/distributed-jobs.resource.js';
import { PluginsResource } from './resources/plugins.resource.js';
import { IntegrationsResource } from './resources/integrations.resource.js';
import { KnowledgeGraphResource } from './resources/knowledge-graph.resource.js';
import { ExtensionsResource } from './resources/extensions.resource.js';

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
/// registry/installations, Integrations, and (Module 16) the Knowledge
/// Graph query layer and Extension API registry — the same disclosed
/// subset the GraphQL API's v1 covers (`graphql-api.types.ts`), not the
/// full ~250+-route REST surface. Every resource method is a thin, typed
/// wrapper around one REST call using the exact same
/// `@pentesthub/shared` endpoint-builder constants and DTO types the
/// server itself is built from, so the SDK can never silently drift from
/// the API it targets. Module 16's other new surfaces (Collaboration
/// extensions, Public Sharing, AI Memory, the real-time SSE gateway) are
/// not yet wrapped here — same disclosed-scope posture, not an
/// oversight; a future pass can add resources for them following the
/// exact same pattern as `knowledge-graph.resource.ts`/
/// `extensions.resource.ts`.
export class PentestHubClient {
  private readonly http: HttpClient;

  readonly auth: AuthResource;
  readonly organizations: OrganizationsResource;
  readonly distributedJobs: DistributedJobsResource;
  readonly plugins: PluginsResource;
  readonly integrations: IntegrationsResource;
  readonly knowledgeGraph: KnowledgeGraphResource;
  readonly extensions: ExtensionsResource;

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
    this.knowledgeGraph = new KnowledgeGraphResource(this.http);
    this.extensions = new ExtensionsResource(this.http);
  }

  /// Directly set/replace the access token in use (e.g. after restoring
  /// a session from storage) without going through `auth.login()`.
  setAccessToken(accessToken: string): void {
    this.http.setAccessToken(accessToken);
  }
}
