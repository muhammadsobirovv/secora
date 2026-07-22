# @pentesthub/sdk (TypeScript / JavaScript)

Official client SDK for the PentestHub AI REST API. Works in Node.js 18+,
browsers, Deno, and Bun (uses the global `fetch`).

## Install

Within this monorepo the package is available as a workspace dependency
(`"@pentesthub/sdk": "workspace:*"`). Published standalone, install with:

```bash
npm install @pentesthub/sdk
```

## Usage

```ts
import { PentestHubClient, PentestHubApiError } from '@pentesthub/sdk';

const client = new PentestHubClient({ baseUrl: 'https://api.your-company.com' });

const result = await client.auth.login({ email: 'you@example.com', password: '...' });
if ('mfaRequired' in result) {
  throw new Error('MFA challenge required — not covered by this quick example');
}

const orgs = await client.organizations.list();
const jobs = await client.distributedJobs.list(orgs[0].id, { status: 'QUEUED' });

try {
  await client.plugins.install(orgs[0].id, {
    pluginId: '...',
    versionId: '...',
    acceptedPermissions: ['network:fetch'],
  });
} catch (error) {
  if (error instanceof PentestHubApiError) {
    console.error(error.code, error.message);
  }
}
```

### API-key auth (service accounts / workers)

```ts
const client = new PentestHubClient({
  baseUrl: 'https://api.your-company.com',
  apiKey: process.env.PENTESTHUB_API_KEY,
});
```

## Scope (v1)

This SDK wraps Auth, Organizations, the Distributed Job System, the
Plugin registry/installations, and Integrations — the same v1 subset
covered by the GraphQL API. Broader REST-parity coverage (Recon/Vuln/AI/
Bug Bounty/Collaboration/Reporting) is a natural follow-up; every
resource method already follows the same thin `HttpClient` +
`@pentesthub/shared` endpoint-constant pattern, so adding a resource is
mechanical.

## Error handling

Every non-2xx response throws `PentestHubApiError`, which carries
`.statusCode` and `.code` (one of `@pentesthub/shared`'s `AppErrorCode`
union, e.g. `"ORGANIZATION_NOT_FOUND"`) so callers can branch on error
type reliably instead of parsing `.message` strings.

## Verification status

This package has not yet been `pnpm install`'d/built in the sandbox this
was authored in (no network access to the npm registry). Before
publishing or relying on it: run `pnpm install` at the repo root, then
`pnpm --filter @pentesthub/sdk build` and `pnpm --filter @pentesthub/sdk check-types`.
