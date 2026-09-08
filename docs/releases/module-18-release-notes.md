# Module 18 Release Notes — Production Hardening, Observability & Reliability

## Scope

Module 18 does not add product features. Every one of its 31 phases
hardens, observes, tests, or documents the platform built across Modules
1-17 — reusing existing services, repositories, `ToolRunner`,
`ScopeEngine`, `PollerLeaseService`, audit logging, and RBAC throughout,
per this module's standing "do not rewrite, do not duplicate
infrastructure" constraint. Nothing below replaces a Module 1-17
capability; everything either closes a gap in it or documents it
honestly, including gaps this module found but deliberately did not fix.

## What was hardened

**Configuration & startup** — a Zod-validated `env.validation.ts` schema
(fails boot immediately, with a clear multi-line error, on any missing
or invalid required variable) and a field-for-field `.env.example`
organized into the categories this module defined: Database, Core/
Deployment, Auth, OAuth, Email, AI, Storage, Redis/Queue, Security, Rate
Limiting, Observability, Threat Intelligence, Feature Flags, Deployment.

**Error handling & correlation** — a global exception filter with a
closed `AppErrorCode` union (no leaking raw stack traces to clients),
and end-to-end request correlation: every request gets an `X-Request-Id`
(client-supplied or generated), threaded through structured logs, audit
events, and the `DistributedJob.requestId` column added this module, so
one ID can trace a request from HTTP entry through to a background job
it enqueued.

**Structured logging & secret redaction** — JSON logs via
`StructuredLoggerService`, with an allowlist-based redaction pass so
tokens/passwords/API keys never reach a log line even transitively.

**Health, readiness, liveness, version** — `/observability/health`
(liveness), `/observability/health/ready` (readiness, real DB
connectivity check), and a version endpoint, all reused by
`deploy/installer/health-check.sh` and this module's own
`docs/operations/production-deployment.md` checklist.

**Database & migrations** — a schema reliability review (see Phase 6's
IDOR sweep below), and `docs/operations/database-migrations.md`
documenting the `prisma db push` vs. `prisma migrate deploy` decision
this repository's migration-history state actually requires operators to
make (disclosed, not glossed over).

**Job queue hardening** — atomic conditional-`updateMany` claiming
(`ClaimNextJobsHandler`, now covered by a new regression test — see
Phase 25 below) replacing read-then-write races throughout the
Distributed Jobs, Recon, and Vuln execution engines; backed-off (not
immediate) retry for crash-orphaned jobs (`WorkerReaperService`,
`ReconJobPollerService.sweepOrphans()` — both now covered by Phase 27's
new disaster-recovery tests).

**Tool execution, SSRF, rate limiting, file/storage security** —
consolidated single-authoritative-path tool execution, centralized SSRF
guarding (`ssrf-guard.util.ts`), a rate-limiting/abuse-protection audit,
and a file/storage security pass (upload validation, magic-byte checks).

**AI safety** — prompt-injection regression tests around every AI
surface that ingests untrusted content (threat intel, scan output,
free-text analyst input), building on the `fenceUntrusted()` pattern
Module 17 established.

**API performance** — pagination caps, N+1 query elimination, and index
review across the higher-traffic query paths.

**SSE hardening** — workspace-scoped auth and connection cleanup on
every SSE stream, plus bounded exponential-backoff auto-reconnect added
to the two job-log streaming hooks (`useReconJobLogs`,
`useVulnScanJobLogs`) — deliberately **not** applied to the AI chat/agent
orchestration streams; see Known Gaps.

**Public sharing & audit log integrity** — dedicated security passes
over `ShareLink` token handling and the `AuditEvent` trail.

**Metrics & observability abstraction** — a Prometheus-format
`/observability/metrics` endpoint via `MetricsRegistryService`, with
alert rules (`deploy/prometheus/alerts.yml`) and Alertmanager
routing/inhibition configured — see
`docs/operations/alerting-and-observability.md` for the full inventory
and its own disclosed gaps.

**Backup & recovery** — `docs/operations/backup-recovery.md` documents
the real backup scopes, scheduling, CLI wizard, and the disclosed PITR
scope boundary (WAL archiving is left to the infrastructure layer by
design).

**Frontend security headers** — a real CSP (with `connect-src` correctly
computed from the deployment's actual API origin, not just `'self'`),
HSTS, and the standard security-header set on every `apps/web` response.

**Dependency audit** — a manual, hands-on review of every
`package.json`/`Cargo.toml` in the monorepo (this sandbox could not run
`pnpm audit`/`cargo audit` — disclosed, not silently skipped), which
surfaced this module's most consequential finding: see Known Gaps.

**Client-surface reliability** — timeout + bounded retry added to the
TypeScript SDK's `HttpClient` (previously unbounded — a hung connection
could await forever) and to the CLI's own npm-registry update check;
Desktop Agent and Mobile app reliability layers were verified already
solid on inspection (bounded exponential backoff in both, plus an
auth-refresh interceptor in Mobile more complete than the SDK's own —
see Known Gaps).

**Security-critical test hardening** — a 16-category coverage audit
(`docs/reviews/0017-...md`) found 13 categories already well-tested and
added real regression tests for the two genuine gaps it found: the
`ApiKeyAuthGuard`'s auth/IP-allowlist/rate-limit logic, and the
Distributed Jobs claim-race protection.

**Disaster/failure-mode tests** — new regression tests for the two
crash-recovery poller loops (`WorkerReaperService`,
`ReconJobPollerService.sweepOrphans()`) that had never been directly
tested despite each having its own documented history of a real race
condition fixed in an earlier phase.

**Final security grep sweep** — a pattern-based pass (command injection,
SQL injection, XSS, hardcoded secrets, CORS, JWT verification, insecure
randomness, `@Public()` route audit, path traversal, TODO/FIXME markers)
across the whole codebase at once. No new finding — see
`docs/reviews/0019-...md`.

## Known gaps — consolidated

Every gap this module found and disclosed rather than fixed, gathered in
one place. None of these are silent; each was recorded in its own
phase's review doc at the time, cross-referenced here.

**Rate limiting is per-instance, not shared across replicas** (Phase
10). Both the global `ThrottlerGuard` and `ApiKeyAuthGuard`'s hand-
rolled per-key limiter keep counters in process memory — correct for a
single-instance Community Edition deployment, but the *effective* limit
across a multi-replica deployment is `configured limit × replica count`.
Closing this needs a shared store (Redis, matching the existing
`RedisCacheService` pattern) wired into both. See
`docs/operations/production-deployment.md` §7.

**No admin/owner-tier endpoint to review a workspace's audit history**
(Phases 17, 19, 25). `AuditService.listRecentForUser` is self-service-
only (used solely by the GDPR data-export flow). Adding a real
admin-facing audit trail is unbuilt product work — a new workspace-
scoped query handler + controller route gated by an admin/owner role
guard — not a configuration toggle.

**`AuditEvent` has no tamper-evidence mechanism** (Phase 19). Rows are
plain, mutable database records; nothing hash-chains or signs them.
Acceptable for this platform's current threat model (the audit log's
purpose today is operational visibility, not court-admissible evidence),
but worth stating plainly rather than implying more integrity than
exists.

**Observability signals are disconnected** (Phase 19). Metrics
(Prometheus), logs (structured JSON + request-ID correlation), and
traces (none — no distributed tracing exists in this codebase) are three
separate systems with no unified exemplar/trace-linking. A request-ID
lets an operator manually correlate a log line to... nothing else yet,
since there's no tracing backend to link to.

**No wired Alertmanager receiver by default** (Phase 19, restated in
Phase 26 as the single highest-priority go-live checklist item).
`deploy/prometheus/alertmanager.yml` ships with routing/inhibition
rules but no Slack/PagerDuty/email receiver configured — alerts fire
into nothing until an operator adds one.

**`RealtimeHubService` keeps an unbounded in-memory connection map, and
Recon/Vuln SSE streams have no heartbeat during quiet polling** (Phase
19, prior-window finding, restated here for completeness). The frontend-
side fix (bounded reconnect on the two job-log hooks) does not close the
backend-side absence of a heartbeat, which is what makes idle-timeout
disconnects happen in the first place on some reverse-proxy
configurations.

**AI chat and agent orchestration SSE streams do not auto-reconnect**
(Phase 23, deliberate). The two job-log hooks got a bounded exponential-
backoff reconnect fix because their state is simple and append-only. The
AI chat/agent streams carry partially-streamed, in-progress content — a
naive reconnect risks duplicating or corrupting a mid-generation
response in a way this sandbox could not verify safely. Deferred with
reasoning recorded, not silently left broken.

**The TypeScript SDK has no automatic refresh-on-401** (Phase 24).
`PentestHubClient.auth.refresh()` (and the `onTokenRefreshed` option
that persists its result) only run when a consumer calls them
explicitly — there is no interceptor that catches a 401 and retries
after refreshing, unlike `apps/web`'s own `client.ts` or the Mobile
app's `ApiClient`, both of which do exactly that.

**The CLI never uses the refresh token it stores** (Phase 24). `pentesthub login` saves a `refreshToken` to
`~/.pentesthub/config.json`, but no CLI command ever reads it or calls
the refresh endpoint — the CLI also bypasses `PentestHubClient`/
`AuthResource` entirely (it builds a raw `HttpClient` for M13-surface
coverage reasons predating this module), so even the SDK-level
`onTokenRefreshed` callback it wires up can never fire. Net effect: a
CLI session's access token eventually expires and requires a manual
`pentesthub login` — a real UX gap, not silently swallowed.

**No true point-in-time recovery** (Phase 20, restated in Phase 26).
Backups are discrete `pg_dump` snapshots; PITR requires Postgres-level
WAL archiving, deliberately left to the infrastructure layer rather than
bundled, since the right tool varies by where Postgres is hosted.

**Postgres itself is not made highly available by anything in this
repository** (Phase 26, inherited from Module 14's own disclosure). Use
a managed offering or a Postgres operator.

**Crash-recovered jobs are not idempotent against external side
effects** (Phase 27, from `WorkerReaperService`'s own doc comment).
Migrating a job off a dead worker re-runs its handler from scratch on a
new worker — safe for the database (handlers upsert on deterministic
keys), but if the dead worker had already issued a real external action
before it crashed (kicked off a scan against a live target, called a
paid AI API, sent a webhook), that action gets re-issued a second time.
Closing this fully needs a stable idempotency key threaded through every
external call site (`ToolRunner`, AI provider adapters, webhook
dispatch) and honored by each provider — a cross-cutting change out of
proportion to any single phase's scope.

**CORRECTED post-Module-18: Phase 22's "Python/Go SDKs don't exist" finding was a false negative.** A dedicated reconciliation checkpoint
(`docs/reviews/0021-post-m18-sdk-reconciliation.md`) found both SDKs
alive, real, and at full resource parity with the TypeScript SDK — at
`sdks/python` and `sdks/go`, not `packages/sdk-python`/`packages/sdk-go`.
Phase 22 checked only the `packages/sdk-*` path convention and, finding
nothing there, wrongly concluded the SDKs were absent rather than
searching for them elsewhere. Module 16's #402/#429 and Module 17's #491
reported this work accurately; Phase 22's audit was the error, not the
task history. Two small, real, previously-undisclosed issues were found
and fixed during reconciliation: the Go SDK's `HttpClient` used
`http.DefaultClient`, which has no timeout at all (same defect class as
this module's own TypeScript SDK fix below — corrected to a 30s default);
and `.github/dependabot.yml` genuinely was missing `pip`/`gomod` entries
for `sdks/python`/`sdks/go` (added). Both SDK READMEs' "Scope (v1)"
sections were also stale (still describing the pre-Module-16 5-resource
list despite the code already having all 14) and have been corrected.
See the reconciliation doc for the full audit, including a real,
passing Python test run (`python3 -m unittest tests.test_client -v` —
5/5 tests passed in-sandbox) and the Go toolchain's continued
unavailability in this sandbox (consistent with every prior module).

## Verification

`mcp__workspace__bash` was denied for the entirety of this module's
session (confirmed repeatedly from Phase 22 onward). Every new test file
this module added (Phases 25 and 27, five spec files total) was written
to match this codebase's established Jest/hand-rolled-mock conventions
and traced field-for-field against the real source it exercises, but
**could not be executed in this sandbox**. This is disclosed explicitly
per this module's standing discipline rather than claimed as a passing
run — see Phase 30 for the final verification-loop attempt.
