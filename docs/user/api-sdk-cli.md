# API, SDK & CLI Quick Reference

Everything you can do in the web app is also available programmatically. The same authorization, scope and audit rules apply.

## REST API

- Base URL: `https://api.secora.group`
- Interactive reference (OpenAPI): [api.secora.group/api/docs](https://api.secora.group/api/docs)

Authenticate with a bearer token:

```bash
curl -H "Authorization: Bearer <token>" https://api.secora.group/auth/me
```

For automation, create an **API key** under **Settings → API keys** and give it only the scopes it needs. Keys can be rotated and revoked at any time. Never commit keys to source control.

## TypeScript SDK

The SDK is not published to npm yet. Build it from the project repository (`packages/sdk-typescript`) and use it like this:

```ts
import { PentestHubClient } from "@pentesthub/sdk";

const client = new PentestHubClient({
  baseUrl: "https://api.secora.group",
  apiKey: process.env.PENTESTHUB_API_KEY,
});
```

Python and Go SDKs are also available in the project repository.

## CLI

The CLI is also built from the repository (`packages/cli`) until it is published to npm:

```bash
pnpm --filter @pentesthub/cli build
node packages/cli/dist/bin/pentesthub.js login --api-key <key>   # recommended for CI
node packages/cli/dist/bin/pentesthub.js --help
```

Credentials are stored in `~/.pentesthub/config.json` with file mode `0600`.

## Webhooks

Webhooks deliver events (for example a finished scan) to your own HTTPS endpoint. Webhook URLs that point to private or internal addresses are rejected.

## Rate limits

Requests are rate limited. If you receive HTTP `429`, wait and retry with backoff.
