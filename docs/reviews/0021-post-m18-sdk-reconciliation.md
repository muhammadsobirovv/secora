# Post-Module-18 Reconciliation Checkpoint — SDK Verification

Date: 2026-09-08. This is a standalone checkpoint between Module 18
(Production Hardening, Observability & Reliability — complete, 6 commits)
and Module 19 (not started, per standing instruction). Its scope is
narrow and explicit: audit the historical completion claims for the
Python and Go SDKs against the actual repository state, since Module
18's own dependency audit (Phase 22, task #524) had reported them as
missing entirely. **Module 19 was not started as part of this
checkpoint.**

## 1. Baseline

Before any change: working tree clean (`git status --short` empty),
`git log --oneline -20` showing Module 18's 6 commits (`e9193b1` back to
`7adfff0`) on top of Module 17's final commit (`d85bc82`). `packages/`
contains `agent-sdk`, `cli`, `eslint-config`, `sdk-typescript`, `shared`,
`typescript-config`, `ui` — no `sdk-python` or `sdk-go` directory
anywhere under `packages/`. `apps/` contains `api`, `browser-extension`,
`desktop`, `mobile`, `web`.

## 2. Historical claim audit — the actual discrepancy

Module 18's `docs/reviews/0014-m18-dependency-security-audit.md` (Phase
22) stated: *"`packages/sdk-python` and `packages/sdk-go` were checked
and confirmed not to exist — not empty stubs, not present under a
different path, simply absent."* That review, `docs/releases/module-18-release-notes.md`'s
Known Gaps section, and `PROJECT_SPEC.md`'s Module 18 paragraph all
repeated this claim, framing it as a "project-history integrity gap"
against Module 16 task #402/#429 and Module 17 task #491, which had
reported "SDK update (TypeScript/Python/Go)" as complete.

Direct repository inspection (not reliance on any prior report) found
this claim is **false**. `find packages apps docs -iname "*sdk*"` turns
up nothing under `packages/` beyond `sdk-typescript` and the unrelated
`agent-sdk` (MCP-facing, a different concept — see `packages/agent-sdk/`).
But `sdks/python` and `sdks/go` — a directory at the repo root, sibling
to `packages/` and `apps/`, not nested under either — contain 53
git-tracked files: a complete Python package (`pentesthub_ai/`, 14
resource modules, `http_client.py`, `errors.py`, a real test suite) and a
complete Go module (14 resource files, `client.go`, `http_client.go`,
`errors.go`, `client_test.go`, `go.mod`), each with its own README.

`git log --diff-filter=A --oneline -- sdks/python/pentesthub_ai/client.py`
resolves to commit `357d97f` ("Modules 7-10: Desktop Agent, Browser
Extension, Bug Bounty OS, Enterprise Platform") — these SDKs have existed
since Modules 7-10, long before Module 18. `git show --stat 24d9849`
(Module 17 task #491's actual commit) confirms it touched
`sdks/go/{assets,incidents,remediation,risk,sla,soc,threat_intel}.go` and
`sdks/python/pentesthub_ai/resources/{assets,incidents,remediation,risk,sla,soc,threat_intel}.py`
directly — the commit message even names the paths correctly
(`sdks/python`, `sdks/go`), so the historical task record was accurate
about where the work landed. **Module 18 Phase 22 checked one path
convention (`packages/sdk-*`, matching the TypeScript SDK and the
pnpm-workspace glob) and, on finding nothing there, concluded the SDKs
were absent without searching for them anywhere else.** That is the
error, not the underlying task history.

Why `sdks/` and not `packages/sdk-python`: `pnpm-workspace.yaml` globs
only `apps/*` and `packages/*` for pnpm-managed JS/TS packages. Placing a
Python or Go package under `packages/` would put it inside that glob,
where pnpm tooling (install, build, lint scripts) would try to treat it
as an npm package and either ignore it uselessly or, worse, get confused
by `pyproject.toml`/`go.mod` sitting where it expects `package.json`.
`sdks/` as a sibling top-level directory, outside the pnpm workspace
entirely, is the correct convention for these two ecosystems — not a
deviation that needs "fixing" to match `packages/sdk-typescript`.

### Reconciliation table

| Item | Historical claim | Repository reality | Status |
|---|---|---|---|
| TypeScript SDK | Complete, `packages/sdk-typescript` | Confirmed: 14 resources, `client.ts` wires all of them, Module 18 Phase 24 already added timeout+retry | VERIFIED |
| Python SDK | Complete (M16 #402/#429, M17 #491); Module 18 Phase 22 claimed missing | Confirmed at `sdks/python` (not `packages/sdk-python`): 14 resources, real test suite, 5/5 tests pass in this sandbox | VERIFIED (Module 18 Phase 22's claim was the error) |
| Go SDK | Complete (M16 #402/#429, M17 #491); Module 18 Phase 22 claimed missing | Confirmed at `sdks/go` (not `packages/sdk-go`): 14 resources, real test suite (`client_test.go`), never runnable in any sandbox this project has had (no Go toolchain) | VERIFIED, existing gap (default HTTP timeout) fixed this pass; still `go build`-unverified |
| CLI | Complete, `packages/cli` | Confirmed: 15 command modules including `soc.ts`/`assets.ts`/`incidents.ts`/`intel.ts`/`remediation.ts`/`risk.ts`/`sla.ts` matching the SDKs' Module 17 surface | VERIFIED |
| SDK authentication | Login/refresh wired, no auto-refresh-on-401 (Module 18 Phase 24, TS only) | Confirmed identical shape across all three SDKs: login callback wiring present, no 401-interceptor auto-refresh in any of the three, consistent (not TS-specific) | VERIFIED — consistent, disclosed limitation, not a new finding |

## 3. TypeScript SDK

No changes made — this was already fully audited by Module 18 Phase 24
(`docs/reviews/0016-m18-cli-desktop-mobile-sdk-reliability-audit.md`),
which added the timeout+retry fix to `http-client.ts` still present and
correct. `client.ts` registers 14 resources
(auth/organizations/distributedJobs/plugins/integrations/knowledgeGraph/extensions/soc/assets/threatIntel/incidents/remediation/risk/sla),
verified by direct read this pass. No parity gap found relative to its
own disclosed v1 scope.

## 4. Python SDK

**Existed already — not implemented from scratch** (rule 4/6: do not
create duplicate SDK infrastructure). `sdks/python/pentesthub_ai/client.py`
wires the same 14 resources as the TypeScript SDK. `http_client.py` is a
zero-dependency `urllib.request`-based transport with a 30s default
timeout (already correct — no gap here, unlike Go).

**Real gap found and fixed:** `README.md`'s "Scope (v1)" section still
listed only the pre-Module-16 5-resource subset (Auth, Organizations,
Distributed Jobs, Plugins, Integrations) even though `client.py` already
had all 14 wired since Module 17. Corrected to list the full current
scope, with a note explaining the staleness and cross-referencing this
document.

**Tests:** the existing suite (`sdks/python/tests/test_client.py`, 5
tests) was not rewritten — it already covers client init, login
success/failure with error-code propagation, unauthenticated 401, direct
token set, and not-found error-code propagation, against a real local
`http.server` (not mocked). Genuinely run in this pass:

```
$ python3 -m compileall pentesthub_ai -q   # exit 0
$ python3 -m unittest tests.test_client -v
test_login_failure_raises_pentesthub_api_error_with_code ... ok
test_login_success_sets_access_token_and_subsequent_calls_authenticate ... ok
test_not_found_error_propagates_code ... ok
test_set_access_token_directly ... ok
test_unauthenticated_request_raises_401 ... ok
Ran 5 tests in 0.525s — OK
```

Also ran a live instantiation check confirming all 14 resource
attributes exist on a constructed client (`auth`, `organizations`,
`distributed_jobs`, `plugins`, `integrations`, `knowledge_graph`,
`extensions`, `soc`, `assets`, `threat_intel`, `incidents`,
`remediation`, `risk`, `sla`) — all present, genuine PASS.

**Verification:** PASS (real, in-sandbox — Python 3.10.12 is available
here, unlike Go).

## 5. Go SDK

**Existed already — not implemented from scratch.** `sdks/go/client.go`'s
`Client` struct has the same 14 resource fields as the TypeScript and
Python SDKs, confirmed by direct read.

**Real gap found and fixed:** `http_client.go`'s `NewHttpClient`
defaulted to `http.DefaultClient` when no caller-supplied `*http.Client`
was given. `http.DefaultClient` has **no timeout at all** — the exact
same defect class Module 18 task #526 had already fixed in the
TypeScript SDK (`packages/sdk-typescript/src/http-client.ts`'s
`DEFAULT_TIMEOUT_MS`), and that the Python SDK's `HttpClient` already
avoided via its own `timeout=30.0` default. Fixed: added a
`defaultRequestTimeout = 30 * time.Second` constant and changed
`NewHttpClient` to construct `&http.Client{Timeout: defaultRequestTimeout}`
when `opts.HTTPClient` is nil, matching both other SDKs' 30s default.
Updated the doc comments on `HttpClientOptions.HTTPClient` /
`Options.HTTPClient` in both `http_client.go` and `client.go` to stop
claiming a `http.DefaultClient` default that no longer exists.

**Also fixed:** `README.md`'s "Scope (v1)" section, same staleness as
Python's — corrected to list all 14 resources and note the correction.
`.github/dependabot.yml` was missing a `gomod` entry for `sdks/go`
(and a `pip` entry for `sdks/python`) — both added, since these are now
confirmed-real ecosystems with real dependency manifests (`go.mod`,
`pyproject.toml`), even though both currently declare zero third-party
dependencies.

**Not changed:** no retry/backoff logic was added (unlike the
TypeScript SDK's GET-retry-with-backoff from Module 18 Phase 24). This
is a real, disclosed, deliberate scope decision for this checkpoint —
see "Remaining gaps" below — not an oversight.

**Tests:** the existing suite (`sdks/go/client_test.go`, 5 tests
mirroring the Python suite, against a real `httptest.Server`) was not
rewritten. It was not runnable in this pass either.

**Verification: `VERIFICATION_BLOCKED` — Go toolchain unavailable.**
`go version` / `which go` both fail; no `/usr/local/go/bin`. Attempted a
genuine remediation this pass (not just re-asserting the known
limitation): tried `apt-get install -y golang-go` (failed — no root, no
`sudo` in this container: `"sudo: The 'no new privileges' flag is set"`),
then tried downloading the official Go tarball directly to a
user-writable prefix via `curl -sL https://go.dev/dl/go1.23.4.linux-amd64.tar.gz`
(failed — `curl` exit 56, no outbound network route to `go.dev` from
this sandbox). This is the same limitation disclosed in every prior
module back to Module 10 ("the first environment in this project's
history with an actual Go toolchain, finally compiling the Go SDK for
real" — implying no environment since has had one). The `http_client.go`
change was visually re-read for syntax correctness (balanced braces,
correct `time` import, matches existing style) but this is not a
substitute for `go build`/`go vet`/`go test`, which remain required
before this fix is trusted in production.

## 6. API parity matrix

Only resource areas the REST API actually exposes to these SDKs are
listed — this is the SDKs' own deliberately scoped v1 surface (stated in
every SDK's top-of-file doc comment and README), not full REST API
coverage. Recon, Vulnerability Scanning, Bug Bounty, AI Chat/Agent, and
Billing have real REST controllers but no SDK wrapper in any of the
three languages — a consistent, longstanding, disclosed scope boundary,
not a Python/Go-specific gap to close here (rule 6: do not invent APIs;
rule "only identify actual parity gaps relevant to the SDK's intended
scope").

| API Area | REST | TS | Python | Go |
|---|---:|---:|---:|---:|
| Auth | ✓ | ✓ | ✓ | ✓ |
| Organizations | ✓ | ✓ | ✓ | ✓ |
| Distributed Jobs | ✓ | ✓ | ✓ | ✓ |
| Plugins | ✓ | ✓ | ✓ | ✓ |
| Integrations | ✓ | ✓ | ✓ | ✓ |
| Knowledge Graph (M16) | ✓ | ✓ | ✓ | ✓ |
| Extensions registry (M16) | ✓ | ✓ | ✓ | ✓ |
| SOC dashboard (M17) | ✓ | ✓ | ✓ | ✓ |
| Assets (M17) | ✓ | ✓ | ✓ | ✓ |
| Threat Intel (M17) | ✓ | ✓ | ✓ | ✓ |
| Incidents (M17) | ✓ | ✓ | ✓ | ✓ |
| Remediation (M17) | ✓ | ✓ | ✓ | ✓ |
| Risk (M17) | ✓ | ✓ | ✓ | ✓ |
| SLA (M17) | ✓ | ✓ | ✓ | ✓ |
| Recon, Vuln, Bug Bounty, AI Chat, Billing | ✓ | — | — | — | *(out of v1 scope for all three SDKs — disclosed, not a gap)* |

Full three-way parity confirmed across every resource area that's
actually in scope. No fabricated rows.

## 7. Auth consistency

All three SDKs (and the CLI) share the same shape: a login/refresh
callback (`onLoginSuccess`/`_handle_login_success`/`OnTokenRefreshed`)
that persists a new access token when the caller explicitly calls
`auth.login()` or `auth.refresh()`. **None of the three SDKs, nor the
CLI, auto-refresh on a 401** — this was already disclosed for the
TypeScript SDK and CLI in Module 18 Phase 24
(`docs/reviews/0016-...md`), and this pass confirms the Python and Go
SDKs have the identical limitation, not a worse one. This is judged an
**intentional, consistent scope boundary** across all four client
surfaces, not a new implementation gap to close in this checkpoint —
building a coalescing refresh-on-401 interceptor correctly (matching
`apps/web`'s own `client.ts` and the Mobile app's `ApiClient`, per
Module 18's own disclosure) is real, non-trivial logic that needs to be
written and tested carefully in three different languages; rushing it
into this narrow reconciliation checkpoint without being able to run any
of the three test suites for two of them (Python could run; Go could
not) would risk introducing an untested auth-path regression. Recorded
here as a real, accurately-scoped, already-disclosed gap — not
newly discovered, not silently re-hidden.

No refresh token is stored insecurely by either new-to-this-checkpoint
change; no credential handling was touched at all in this pass.

## 8. Tests

No new test files were added — both SDKs already had real, non-mocked
regression suites (Python: local `http.server`; Go: `httptest.Server`)
covering client init, auth headers, a successful call, an API error with
code propagation, and an unauthenticated 401, which meets this
checkpoint's Phase 7 bar without duplicating existing infrastructure
(rule 6). The Python suite was executed for real (5/5 pass, see above).
The Go suite could not be executed (toolchain unavailable, see above) —
its existing self-disclosure in `sdks/go/client_test.go`'s own doc
comment ("this file has NOT been verified with `go test` in this
sandbox") already states this accurately and needed no correction.

## 9. Documentation reconciliation

Corrected in place (original text preserved and explicitly marked
"CORRECTED", not deleted — rule 14/15):

- `docs/reviews/0014-m18-dependency-security-audit.md` — Finding #1 (SDK
  non-existence) and Finding #5 (Dependabot "complete coverage") both
  corrected with the original text quoted verbatim first.
- `docs/releases/module-18-release-notes.md` — the "significant
  project-history integrity gap" Known Gaps entry corrected.
- `PROJECT_SPEC.md` — a new dated paragraph appended after the Module 18
  paragraph, not an edit to the Module 18 paragraph itself, so the
  historical record of what Module 18 claimed at the time remains intact
  and the correction is visibly a later, separate event.
- `sdks/go/README.md` and `sdks/python/README.md` — stale "Scope (v1)"
  sections corrected to the real 14-resource list, each with a note
  explaining what was stale and why, plus a cross-reference to this
  document.

Task-tracker items #402, #429, #452 (Module 16 SDK updates) and #491
(Module 17 SDK updates) were already marked `[completed]` and remain so
— they were accurate. No task-tracker item needed correction; the error
was confined to Module 18 Phase 22's audit output and its downstream
documentation.

## 10. Security review

Reviewed every file touched this checkpoint for the standard SDK-client
risk classes:

- **Hardcoded secrets:** none introduced. `base_url`/`BaseURL` remain
  caller-supplied constructor parameters in all three SDKs, as they
  already were; no default production URL exists anywhere in any SDK.
- **Insecure TLS:** not touched. Neither SDK disables certificate
  verification anywhere (`http_client.py` uses plain `urllib.request`
  with no `ssl` context override; `http_client.go`'s new
  `&http.Client{Timeout: ...}` is the stdlib default `Transport`, no
  `InsecureSkipVerify`).
- **SSRF via configurable base URL:** this is inherent to any HTTP SDK
  by design (the caller chooses which server to talk to) and is not a
  new risk introduced by this checkpoint's changes — no new
  destination-construction logic was added anywhere.
- **Credential logging:** not touched; no logging statements were added
  to any SDK in this pass.
- **Cross-workspace / authorization assumptions:** unchanged. All three
  SDKs remain thin clients — every resource method is a direct
  1:1 wrapper around one REST call with no client-side authorization
  logic, consistent with the project's standing "backend remains the
  security boundary" posture (rule from Phase 9 of this task). The
  Go timeout default change and the two README corrections carry zero
  authorization-relevant logic.
- **Arbitrary file access / command execution / unsafe deserialization:**
  not applicable — no such code exists in any of the touched files; the
  Go/Python changes are HTTP-transport configuration and documentation
  only.

No finding.

## 11. Verification matrix

| Component | Verification | Result |
|---|---|---|
| TypeScript SDK | No changes made this pass; already verified in Module 18 Phase 24 | Not re-run — no diff to verify |
| Python SDK | `python3 -m compileall` + `python3 -m unittest tests.test_client -v` (real, in-sandbox) | PASS (5/5 tests) |
| Go SDK | `go build`/`go vet`/`go test` attempted; toolchain install attempted via apt (no root) and direct tarball download (no network route) | VERIFICATION_BLOCKED — Go toolchain unavailable |
| CLI | No changes made this pass | Not re-run — no diff to verify |
| API parity | Direct read of `client.ts`/`client.py`/`client.go` resource registrations against each other | PASS — full 14-resource parity confirmed by inspection |
| `.github/dependabot.yml` | YAML structure reviewed by eye (added two new list entries matching the existing schema exactly) | Not machine-validated (no `dependabot.yml` linter available in this sandbox) — visually consistent with the six pre-existing entries |

## 12. Remaining gaps (evidence-backed, not fixed in this checkpoint)

- **Go SDK still unverified by the actual Go toolchain.** The timeout
  fix, and the SDK as a whole, has never been compiled or run by `go
  test` in any sandbox this project has had access to since Module 10.
  This is the single largest remaining risk from this checkpoint — a
  real `go build ./... && go vet ./... && go test ./... -v` run in a
  normal development environment is a hard prerequisite before treating
  this SDK as production-ready, not merely recommended.
- **No auto-refresh-on-401 in any of the three SDKs or the CLI**
  (confirmed consistent, not worsened, by this checkpoint — see §7).
  Building it correctly is real, non-trivial, cross-language work
  deliberately left out of this narrow reconciliation scope.
- **Python and Go SDKs lack the TypeScript SDK's GET-retry-with-backoff**
  (Module 18 Phase 24 added retry to `http-client.ts` only). Not
  implemented here — a deliberate scope decision (see §5), not an
  oversight, given the inability to fully test it in Go in this sandbox.
- **`sdks/go/go.mod` has no `go.sum`** (zero dependencies means nothing
  to checksum yet) — will need one the moment a real dependency is ever
  added; not an issue today.

## 13. Final state

- **Module 19 was NOT started.** This checkpoint's scope was strictly
  the SDK reconciliation described above.
- Working tree: see the commits listed in this checkpoint's closing
  commit sequence; `git status --short` is clean after the final commit.
- **No fake completion claims were made.** The Go SDK's fix is
  explicitly marked `VERIFICATION_BLOCKED`, not claimed as tested. The
  Python SDK's PASS is a real, reproduced-in-this-document test run, not
  an assertion.
- Blocked verification (Go toolchain) is disclosed here, in
  `sdks/go/README.md`, in `docs/releases/module-18-release-notes.md`,
  and in `PROJECT_SPEC.md` — four independent places a future reader
  would plausibly look, not buried in one.
