import type { AuthTokensDto } from '@pentesthub/shared';
import { HttpClient, type HttpClientOptions } from './http-client.js';
import { AuthResource } from './resources/auth.resource.js';
import { OrganizationsResource } from './resources/organizations.resource.js';
import { DistributedJobsResource } from './resources/distributed-jobs.resource.js';
import { PluginsResource } from './resources/plugins.resource.js';
import { IntegrationsResource } from './resources/integrations.resource.js';
import { KnowledgeGraphResource } from './resources/knowledge-graph.resource.js';
import { ExtensionsResource } from './resources/extensions.resource.js';
import { SocResource } from './resources/soc.resource.js';
import { AssetsResource } from './resources/assets.resource.js';
import { ThreatIntelResource } from './resources/threat-intel.resource.js';
import { IncidentsResource } from './resources/incidents.resource.js';
import { RemediationResource } from './resources/remediation.resource.js';
import { RiskResource } from './resources/risk.resource.js';
import { SlaResource } from './resources/sla.resource.js';

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
/// registry/installations, Integrations, (Module 16) the Knowledge
/// Graph query layer and Extension API registry, and (Module 17,
/// task #491) the SOC/Assets/Threat-Intel/Incidents/Remediation/Risk/
/// SLA surfaces — the same disclosed subset the GraphQL API's v1 covers
/// (`graphql-api.types.ts`), not the full ~250+-route REST surface.
/// Every resource method is a thin, typed wrapper around one REST call
/// using the exact same `@pentesthub/shared` endpoint-builder constants
/// and DTO types the server itself is built from, so the SDK can never
/// silently drift from the API it targets. Module 16's other new
/// surfaces (Collaboration extensions, Public Sharing, AI Memory, the
/// real-time SSE gateway) and Module 17's link-* incident mutations are
/// not yet wrapped here — same disclosed-scope posture, not an
/// oversight; a future pass can add resources for them following the
/// exact same pattern as `knowledge-graph.resource.ts`/
/// `extensions.resource.ts`/`incidents.resource.ts`.
export class PentestHubClient {
  private readonly http: HttpClient;

  readonly auth: AuthResource;
  readonly organizations: OrganizationsResource;
  readonly distributedJobs: DistributedJobsResource;
  readonly plugins: PluginsResource;
  readonly integrations: IntegrationsResource;
  readonly knowledgeGraph: KnowledgeGraphResource;
  readonly extensions: ExtensionsResource;
  readonly soc: SocResource;
  readonly assets: AssetsResource;
  readonly threatIntel: ThreatIntelResource;
  readonly incidents: IncidentsResource;
  readonly remediation: RemediationResource;
  readonly risk: RiskResource;
  readonly sla: SlaResource;

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
    this.soc = new SocResource(this.http);
    this.assets = new AssetsResource(this.http);
    this.threatIntel = new ThreatIntelResource(this.http);
    this.incidents = new IncidentsResource(this.http);
    this.remediation = new RemediationResource(this.http);
    this.risk = new RiskResource(this.http);
    this.sla = new SlaResource(this.http);
  }

  /// Directly set/replace the access token in use (e.g. after restoring
  /// a session from storage) without going through `auth.login()`.
  setAccessToken(accessToken: string): void {
    this.http.setAccessToken(accessToken);
  }
}
