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
installations, Integrations, (Module 16) the Knowledge Graph query layer
and Extension API registry, and (Module 17) SOC/Assets/Threat-Intel/
Incidents/Remediation/Risk/SLA — the same v1 subset the TypeScript and Go
SDKs cover (`client.py`'s `PentestHubClient` wires all fourteen
resources). This is a deliberately scoped subset of the full REST API —
Recon, Vulnerability Scanning, Bug Bounty, AI Chat, and Billing are out
of scope for all three official SDKs today, not a Python-specific gap.

*Note: this README previously described the pre-Module-16 scope (5
resources) even though `client.py` already had all 14 wired — updated
during the post-Module-18 SDK reconciliation checkpoint to match the
actual code. A prior Module 18 audit pass also incorrectly reported this
SDK as not existing in the repository at all (it checked
`packages/sdk-python` and did not search for the actual location,
`sdks/python`, established since Modules 7-10) — see
`docs/reviews/0021-post-m18-sdk-reconciliation.md`.*

## Testing

```bash
python3 -m unittest tests.test_client -v
```

Runs against a real local `http.server` instance (no mocking, no network
access required) — verified passing in this repository's sandbox.
