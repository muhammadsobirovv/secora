# pentesthub-go

Official Go client for the Secora AI REST API. Zero third-party
dependencies — built entirely on `net/http` and `encoding/json` from the
standard library.

## Install

```bash
go get github.com/pentesthub-ai/pentesthub-go
```

(within this monorepo: `require github.com/pentesthub-ai/pentesthub-go v0.1.0` with a `replace` directive pointing at `sdks/go`)

## Usage

```go
package main

import (
	"context"
	"errors"
	"fmt"
	"log"

	pentesthub "github.com/pentesthub-ai/pentesthub-go"
)

func main() {
	client := pentesthub.New(pentesthub.Options{BaseURL: "https://api.your-company.com"})

	ctx := context.Background()
	tokens, mfa, err := client.Auth.Login(ctx, pentesthub.LoginRequest{
		Email:    "you@example.com",
		Password: "...",
	})
	if err != nil {
		log.Fatal(err)
	}
	if mfa.MfaRequired {
		log.Fatal("account requires MFA; complete the challenge via the REST API directly")
	}
	_ = tokens

	orgs, err := client.Organizations.List(ctx)
	if err != nil {
		log.Fatal(err)
	}

	jobs, err := client.DistributedJobs.List(ctx, orgs[0].ID, pentesthub.ListDistributedJobsFilter{Status: "QUEUED"})
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(len(jobs), "queued jobs")

	_, err = client.Plugins.Install(ctx, orgs[0].ID, pentesthub.InstallPluginRequest{
		PluginID:            "...",
		VersionID:           "...",
		AcceptedPermissions: []string{"network:fetch"},
	})
	if err != nil {
		var apiErr *pentesthub.APIError
		if errors.As(err, &apiErr) {
			fmt.Println(apiErr.Code, apiErr.Message)
		}
	}
}
```

### API-key auth (service accounts / workers)

```go
client := pentesthub.New(pentesthub.Options{
	BaseURL: "https://api.your-company.com",
	APIKey:  os.Getenv("PENTESTHUB_API_KEY"),
})
```

## Scope (v1)

Auth, Organizations, the Distributed Job System, the Plugin registry/
installations, Integrations, (Module 16) the Knowledge Graph query layer
and Extension API registry, (Module 17) SOC/Assets/Threat-Intel/
Incidents/Remediation/Risk/SLA, and (Module 20) API Keys — the same v1
subset the TypeScript and Python SDKs cover (`client.go`'s `Client`
struct lists all fifteen resources). OAuth redirect flows, the
worker-facing job claim/complete/fail routes, and the five incident
`link-*` mutations are intentionally not wrapped (see doc comments in
`distributed_jobs.go`, `integrations.go`, and `incidents.go`). This is a
deliberately scoped subset of the full REST API — Recon, Vulnerability
Scanning, Bug Bounty, AI Chat, and Billing are out of scope for all three
official SDKs today, not a Go-specific gap.

*Note: this README previously described the pre-Module-16 scope (5
resources) even though `client.go` already had all 14 wired — updated
during the post-Module-18 SDK reconciliation checkpoint to match the
actual code. A Module 20 audit then found `ApiKeysController`
(`/public-api/keys/*`, live since Module 15 task #336) had never been
wrapped in any SDK or the CLI — a real, confirmed parity gap, now closed
by `api_keys.go` and this updated scope line (now 15 resources).*

## Testing

```bash
go test ./...
```

Runs `client_test.go` against a real local `net/http/httptest.Server`
(no mocking), the same "genuine local server, not a mock" standard the
Python SDK's test suite uses.

## Verification status

**Field-audited against `packages/shared`, but not yet verified with the
Go toolchain.** A follow-up pass cross-referenced every struct in this
package against its real shared DTO and fixed several drifted fields
that were caught only by re-reading the source (not by compiling — Go
isn't available here): `QueueMetrics` was originally shaped nothing like
`QueueMetricsDto` (wrong field set entirely), `DistributedJob.CompletedAt`
should have been `FinishedAt`, `PluginInstallation` had a phantom
`Status` field that doesn't exist on `PluginInstallationDto` (the real
field is `Enabled`), and `IntegrationCapability`/`IntegrationConnection`
were missing/misnamed fields. `Organization`/`AuthenticatedUser` remain
intentionally minimal subsets of their DTOs (not exhaustive) rather than
bugs — extend them as needed.

**Not yet verified with the Go toolchain.** The sandbox this SDK was
authored in does not have Go installed (`go: command not found`), so
this package has not been compiled or run through `go vet`/`go test`
here. Before publishing or depending on this SDK in a real project, run
from `sdks/go/`:

```bash
go mod tidy
go vet ./...
go test ./... -v
```

The code follows the exact same route shapes, request/response fields,
and error contract (`AppErrorResponseDto` → `APIError{StatusCode, Code,
Message}`) as the already-verified TypeScript and Python SDKs, and was
written by directly cross-referencing `packages/shared/src/*-endpoints.ts`
and the corresponding NestJS controllers, so it should compile and pass
cleanly — but this has not been runtime-confirmed.

**Post-Module-18 reconciliation checkpoint note:** a prior Module 18 audit
pass (`docs/reviews/0014-m18-dependency-security-audit.md`) incorrectly
reported this SDK as not existing in the repository — it checked
`packages/sdk-go` specifically and did not search for the actual location
(`sdks/go`, established since Modules 7-10). That claim has been
corrected; see `docs/reviews/0021-post-m18-sdk-reconciliation.md` for the
full audit. During the same checkpoint, `HttpClient`'s default transport
was changed from `http.DefaultClient` (no timeout at all) to a client
with a 30s timeout, matching the TypeScript SDK's own Module 18 fix and
the Python SDK's pre-existing default — a real, previously-undisclosed
reliability gap, not a compile-blocking change. The Go-toolchain-
unavailable limitation above is still unresolved and still applies to
this fix.
