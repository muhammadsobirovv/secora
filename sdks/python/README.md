# pentesthub-ai (Python SDK)

Official Python client for the PentestHub AI REST API. Zero third-party
runtime dependencies (built on `urllib.request`) — `pip install
pentesthub-ai` will never fail because of an unrelated package's native
build.

## Install

```bash
pip install pentesthub-ai
```

(within this monorepo: `pip install -e sdks/python`)

## Usage

```python
from pentesthub_ai import PentestHubClient, PentestHubApiError

client = PentestHubClient(base_url="https://api.your-company.com")

tokens = client.auth.login(email="you@example.com", password="...")
orgs = client.organizations.list()
jobs = client.distributed_jobs.list(orgs[0]["id"], status="QUEUED")

try:
    client.plugins.install(
        orgs[0]["id"],
        plugin_id="...",
        version_id="...",
        accepted_permissions=["network:fetch"],
    )
except PentestHubApiError as error:
    print(error.code, error.message)
```

### API-key auth (service accounts / workers)

```python
client = PentestHubClient(base_url="https://api.your-company.com", api_key=os.environ["PENTESTHUB_API_KEY"])
```

## Scope (v1)

Auth, Organizations, the Distributed Job System, the Plugin registry/
installations, and Integrations — the same v1 subset the TypeScript SDK
and GraphQL API cover.

## Testing

```bash
python3 -m unittest tests.test_client -v
```

Runs against a real local `http.server` instance (no mocking, no network
access required) — verified passing in this repository's sandbox.
