import { HttpClient } from '@pentesthub/sdk';
import type { CliConfig } from './config.js';
import { saveConfig } from './config.js';

/// Builds the same `HttpClient` the SDK's `SecoraClient` uses
/// internally (exported from `@pentesthub/sdk` for exactly this reason)
/// — the CLI talks to every REST endpoint through it directly rather
/// than through `SecoraClient`'s five resource wrappers, since those
/// only cover Auth/Organizations/Distributed Jobs/Plugins/Integrations
/// (the SDK's disclosed v1 scope), not the Module 13 surfaces
/// (`/mcp`, `/agent-sdk`, `/scripts`, `/developer-portal`,
/// `/observability`) this CLI is built for.
export function buildHttpClient(config: CliConfig): HttpClient {
  return new HttpClient({
    baseUrl: config.baseUrl,
    accessToken: config.accessToken,
    apiKey: config.apiKey,
    onTokenRefreshed: (accessToken) => {
      saveConfig({ ...config, accessToken });
    },
  });
}
