# pentesthub-go

Official Go client for the PentestHub AI REST API. Zero third-party
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
installations, and Integrations — the same v1 subset the TypeScript and
Python SDKs and the GraphQL API cover. OAuth redirect flows and the
worker-facing job claim/complete/fail routes are intentionally not
wrapped (see doc comments in `distributed_jobs.go` and
`integrations.go`).

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
