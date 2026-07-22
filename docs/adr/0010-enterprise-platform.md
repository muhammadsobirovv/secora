# 0010: Enterprise Platform + SaaS + Global Infrastructure (Module 10)

## Context

Modules 1-9 built a complete single-tenant-feeling (though `Workspace`-scoped
since Module 1) bug bounty / pentesting platform: auth, recon, vulnerability
scanning, AI copilot, a full bug bounty operating system, a Desktop Agent, and
a Browser Extension. Module 10's spec asks for the platform to become
something a real company can run as infrastructure: real multi-tenant
organizations above the existing Workspace layer, a distributed job system
that scales scan execution beyond one process, a plugin marketplace, native
third-party integrations, team workspaces, enterprise reporting/analytics, a
public API platform (REST, GraphQL, webhooks, SDKs in three languages), a
visual workflow automation engine, compliance tooling (retention, backup,
GDPR export), and the operational trilogy every real deployment eventually
needs: observability, high availability, and security hardening — plus CI/CD
and deployment templates to actually run it. Fourteen subsystems, the largest
module by scope in this project's history. This ADR covers the decisions that
span multiple subsystems; each subsystem's own file-level doc comments carry
the narrower, local decisions.

## Decision

### 1. `Organization` sits above `Workspace`, doesn't replace it

Every prior module's tenant boundary is `Workspace`. Module 10 adds
`Organization` as a new, optional parent: a `Workspace` can belong to a
`Team`, which belongs to an `Organization`, or remain organization-less
exactly as before. This is additive in the strongest sense — no existing
`Workspace`-scoped query changes shape, no existing route's authorization
model changes. `Organization` exists specifically for the new Module 10
surfaces that only make sense above workspace scope: billing/seats,
organization-wide RBAC roles, the Distributed Job queue, Plugin
installations, Integration connections, Enterprise Reporting/Analytics, and
the GraphQL/Webhook/SDK platform. A user or workspace that never touches any
Module 10 feature never encounters `Organization` at all.

### 2. Distributed Job System: claim-based work queue, not a message broker

`DistributedJob`/`WorkerNode` implement a pull-based queue directly on
Postgres — workers `claim()` the next `QUEUED` job matching their declared
`capabilities` via a `SELECT ... FOR UPDATE SKIP LOCKED`-style claim (the
same optimistic-claim pattern `ReconJobPollerService` established back in
Module 3), rather than introducing a message broker (RabbitMQ, SQS, Redis
Streams). This keeps the "zero new infrastructure dependency" posture every
module since Module 1 has held to, at the cost of not getting a broker's
built-in features (priority queues, dead-letter handling, fanout) for free —
`DistributedJobPriority` and job-level retry/`lastError` tracking reimplement
the pieces of that this project actually needs on top of Postgres directly.

### 3. Plugin Marketplace: capability-scoped, permission-accepted, sandboxed by contract not by runtime

`Plugin`/`PluginInstallation`/`PluginVersion` model a marketplace where each
plugin declares required permissions (`network:fetch`, specific entity
read/write scopes) that an installing admin must explicitly accept
(`acceptedPermissions` on `PluginInstallation`). This is a contractual
sandbox, not a runtime one — there is no separate process/container isolating
a plugin's hook execution from the rest of the API process. A plugin hook
today runs in-process via `ExecutePluginHookCommand`. This is a disclosed,
deliberate v1 scope boundary: real code-execution isolation (a WASM runtime,
a separate worker process with a locked-down syscall filter, or similar) is
flagged as the concrete follow-up before accepting untrusted third-party
plugin code in a real multi-tenant SaaS deployment — the permission model is
real and enforced, but it's an honor-system contract against a plugin's
*declared* behavior, not a technical guarantee against malicious code.

### 4. Integrations framework: capability registry + generic action executor

`IntegrationCapability` (what each provider supports: `authMethod`,
`actions`) is a static registry entry per provider; `IntegrationConnection`
is a tenant's actual OAuth/token-authenticated connection to one. Every
provider-specific action (create a Jira ticket, post a Slack message, sync a
GitHub issue) goes through one generic `ExecuteIntegrationActionCommand`
rather than one command class per provider action — this is what lets
Module 10's other subsystems (the Automation Engine's `create_ticket`/
`sync_data` step kinds in particular) integrate with *any* connected
provider through a single `CommandBus.execute()` call without importing
`IntegrationsModule` or knowing which providers exist.

### 5. Enterprise Reporting/Analytics reuse Module 6/9's rendering, don't reimplement it

`ReportContentBuilderService` (Enterprise Reporting) computes an
organization/workspace-scoped content payload and is the single code path
both `POST .../reports/generate` (on-demand) and `ReportScheduleRunnerService`
(scheduled) call — matching the Module 9 pattern where
`BugReportGeneratorService`'s five renderers are the one code path for both
manual and (now, transitively, via the Automation Engine's `report` step
kind) automated report generation. Enterprise Analytics similarly computes
its aggregates via read-time Prisma aggregation queries scoped by
organization, not a separate pre-computed data warehouse — appropriate at
this project's scale; a real high-volume SaaS deployment would eventually
want a proper OLAP/warehouse layer, noted as a scaling follow-up rather than
built speculatively now.

### 6. API Platform: three protocols (REST, GraphQL, Webhooks), three SDK languages, one shared DTO source of truth

`packages/shared/src/*.ts` remains the single source of truth for every
DTO/endpoint-path constant, exactly as established in Module 1 — the GraphQL
resolvers (Module 10, new) return the same DTOs the REST controllers do
rather than defining a parallel GraphQL-specific type layer, and all three
SDKs (TypeScript, Python, Go) were hand-written by cross-referencing those
same shared endpoint/DTO definitions rather than generated from an OpenAPI
spec — see each SDK's own README for its specific verification status. The
webhook event catalog (`WEBHOOK_EVENT_TYPES`) was corrected during this
module to match real domain-event `verb` strings after discovering the
original catalog (authored ahead of the events that would eventually
populate it) never actually matched anything real events emit — see
`webhook-signature.util.ts`'s `toWebhookEventKey()` for the normalization
this required.

### 7. Webhook delivery: enqueue synchronously, deliver asynchronously

`WebhookDispatchHandler` (an `@EventsHandler` over ~25 domain event classes)
only inserts `WebhookDelivery` rows — fast, synchronous, no network I/O
inline with the request/event that triggered it. `WebhookDeliveryQueueService`
(a separate minute-tick poller) performs the actual signed HTTP delivery with
exponential backoff (`[1, 5, 15, 60, 180]` minutes, 6 attempts before
`DEAD_LETTER`). This same split — fast synchronous enqueue, slow async
delivery on a separate tick — is reused for the Automation Engine's workflow
triggering (`TriggerWorkflowCommand` calls `WorkflowExecutorService.start()`
directly since workflow execution, unlike webhook delivery, has no external
network dependency in its common path) and for every other Module 9/10
scheduled-work service.

### 8. Automation Engine: a small step-graph interpreter, not a general workflow language

`WorkflowExecutorService.executeStep()` supports nine step kinds (`recon`,
`scan`, `report`, `notify`, `ai_analysis`, `create_ticket`, `sync_data`,
`condition`, `loop`, `delay`) via a `next`/`whenTrue`/`whenFalse`/`onFailure`
step graph, not an embedded scripting language or a dependency on an external
workflow engine (Temporal, Airflow, n8n). `condition` branches control flow
in-process; `delay` is the one kind that doesn't complete synchronously — it
sets `pausedAtStepKey`/`resumeAt` on the `WorkflowRun` and returns, and
`WorkflowRunnerService`'s tick resumes it once due. `recon`/`scan` steps
honestly record the intent to trigger a job (`{note: 'Recorded — wire to
ReconJob/VulnScanJob creation...'}`) rather than fabricating a job from
incomplete parameters, mirroring the exact same honest-recording pattern
`ScheduledJobRunnerService` established in Module 9 for its own
`DAILY_RECON`/`WEEKLY_NUCLEI` kinds — a generic scheduler/workflow engine
structurally lacks the concrete `targetId` + tool selection a real recon/scan
job needs, and fabricating one would be worse than recording the gap
honestly.

### 9. Compliance: real enforcement, narrow and disclosed scope

`DataRetentionEnforcerService` only auto-deletes two safely-scoped
operational tables (`API_REQUEST_LOG`, `WEBHOOK_DELIVERY`) — both have a
clear `createdAt` cutoff and are disposable log data, unlike e.g.
`AiMessage` or `BugBountyFinding` rows, which are user content an automated
deletion policy shouldn't touch without much more deliberate scoping. A
retention policy for any other `resourceType` is stored and returned by the
API (so an operator can document their retention posture even before
automatic enforcement covers it) but logged-and-skipped rather than silently
doing nothing forever unnoticed. `ComplianceExportProcessorService`'s GDPR
export scope (v1: `AUDIT_EVENTS`, `ORGANIZATION_MEMBERS`, `WORKFLOWS`,
`INTEGRATION_CONNECTIONS`) was caught missing an organization-membership
filter on `AuditEvent` during implementation — `AuditEvent` has no
`organizationId` column (it's user-scoped, not tenant-scoped), so the
original `where: scope.subjectUserId ? {...} : {}` fallback would have
exported every user's audit trail system-wide to any org admin. Fixed by
resolving `organizationMember` userIds first and filtering
`AuditEvent.userId IN (...)` — see that service's file for the corrected
implementation.

### 10. Observability: hand-rolled Prometheus registry, real OpenTelemetry tracing, structured JSON logging — zero-to-minimal new dependencies

`MetricsRegistryService` is a from-scratch `Counter`/`Histogram`
implementation rendering real Prometheus text-exposition format, not
`prom-client` — consistent with this project's dependency posture, and
simple enough (two metric types, a documented text format) that a library
adds more surface than it saves. Distributed tracing (`tracing.ts`) is the
one disclosed exception: real `@opentelemetry/sdk-node` +
`exporter-trace-otlp-http` were added as genuine new dependencies (not
verified installed/built in this sandbox — see that file's own disclosure
comment), since correctly implementing the OTLP wire protocol and W3C
trace-context propagation from scratch would be reinventing a
standards-compliance-critical wheel poorly. `withSpan()` is wired into two
representative call sites (`WorkflowExecutorService.executeStep`,
`WebhookDeliveryQueueService`'s outbound `fetch()`) rather than exhaustively
into every service — a disclosed narrower v1 scope, not an oversight.
`StructuredLoggerService` (JSON-lines, dependency-free, implements Nest's
`LoggerService`) replaces the default console logger app-wide via
`NestFactory.create(AppModule, { logger: new StructuredLoggerService() })`.

Two-tier metrics endpoint security: the global `/observability/metrics`
endpoint (process-level gauges + the two Counters above) is `@Public()` with
an *optional* shared-secret check (open by default — correct for local/
sandboxed environments; Prometheus scrapers have no OAuth/JWT identity to
present in the first place, so network-level access control, not application
auth, is the standard way to protect a metrics endpoint in production). The
per-organization queue-metrics endpoint
(`/enterprise/organizations/:id/distributed-jobs/metrics/prometheus`) makes
the same token check *mandatory* instead — this route exposes tenant-scoped
data with no other authorization at all. An earlier draft of this endpoint
reused `GetQueueMetricsQuery` (which authorizes via the *requesting user's*
org membership) with a fabricated `'system'` userId on a `@Public()` route —
a confused-deputy/enumeration risk an unauthenticated caller could have used
to probe org membership via a `?userId=` parameter. Fixed by computing the
same aggregates directly via Prisma with zero user-identity involvement
instead.

### 11. High Availability: `PollerLeaseService`, a Postgres row-based distributed lease — not `pg_advisory_lock`, not a new broker

Every `setInterval`-based poller added across Modules 9-10
(`ScheduledJobRunnerService`, `ReportScheduleRunnerService`,
`WebhookDeliveryQueueService`, `WorkflowRunnerService`,
`DataRetentionEnforcerService`, `BackupPolicyRunnerService`,
`ComplianceExportProcessorService`) originally ticked independently on every
replica of the API process — harmless at one replica, but a real correctness
problem at N (duplicate webhook deliveries, duplicate destructive retention
deletions, duplicate workflow-run resumptions). `PollerLeaseService`
(`apps/api/src/common/concurrency/poller-lease.service.ts`) fixes this with
one new table (`PollerLease`: `id` = lease name, `holderId`, `expiresAt`) and
a conditional `UPDATE ... WHERE id = ? AND (expiresAt < now() OR holderId =
?)` compare-and-swap — Postgres's own row-level locking during that UPDATE
statement is what actually prevents two replicas from both believing they
won the lease, not application-level reasoning. This was chosen over
`pg_advisory_lock`/`pg_try_advisory_xact_lock` specifically because those
either require pinning the entire critical section to one Postgres
connection (awkward with Prisma's pooled driver adapter) or to one open
transaction for the section's full duration (undesirable when the guarded
work makes outbound HTTP/AI calls, as webhook delivery and workflow
execution both do) — a plain leased row avoids both, at the cost of being a
lease with a TTL (not an unconditional mutex), which is the correct trade-off
for this use case regardless: a crashed replica's stale lease expires and
fails over automatically rather than deadlocking the tick forever.

Every service's `tick()` was refactored to `tick() { withLease(name, ttl, ()
=> this.runTick()) }` — a small, uniform, mechanical change applied
identically across all seven services rather than seven bespoke locking
implementations.

Beyond the poller lease, HA/performance work in this pass: `main.ts` now
calls `app.enableShutdownHooks()` so `SIGTERM` runs every service's
`onModuleDestroy` (clearing intervals, releasing lease holds, closing the
Prisma pool) before the process exits, instead of the process being killed
mid-request; and `DATABASE_POOL_MAX` (`env.validation.ts`, wired into
`PrismaService`'s `PrismaPg` adapter) makes the per-replica Postgres
connection pool size explicit and tunable rather than left at
`node-postgres`'s library default, since the correct value scales inversely
with replica count.

### 12. Security Hardening: tuned CSP/HSTS, not a redesign of Module 1's auth model

Module 1 already implemented the bulk of this project's auth hardening
(refresh token rotation, account lockout, OAuth CSRF state, MFA, argon2
hashing) and Module 9 added encryption/RBAC/audit history — this pass's
concrete addition is fixing `helmet()`'s bare default configuration, which
would have broken `SwaggerModule.setup()`'s self-hosted Swagger UI page in
any deployment that actually enabled it (the default CSP's `script-src
'self'`/`style-src 'self'` blocks Swagger UI's inline bundle) while adding
explicit HSTS (`max-age=180d`, `includeSubDomains`, deliberately *not*
`preload` — that's a one-way opt-in to browsers' hardcoded HSTS list this
application shouldn't make on a deployment's behalf) and an explicit
`frameguard: deny` clickjacking policy. See `bootstrap.ts`'s
`configureApp()` for the full configuration and reasoning. A genuinely new
auth-model redesign (e.g. moving from bearer tokens to httpOnly session
cookies) was considered out of scope — it would be exactly the kind of
broad Module 1 rewrite the standing "don't rewrite previous modules"
instruction guards against, and bearer-token SPA auth is a legitimate,
common architecture, not a defect.

### 13. CI/CD + Deployment: four independent paths sharing one build

`.github/workflows/ci.yml` runs lint/typecheck/test/build via Turborepo
across the whole workspace, with a `pgvector/pgvector` Postgres service
container for `apps/api`'s Jest suite (`prisma db push`, not `migrate
deploy` — see point 14) plus dedicated jobs for the Python and Go SDKs (the
first environment in this project's history with an actual Go toolchain —
every prior Go SDK claim was "field-audited, not compiler-verified"; this CI
job is where that finally gets checked for real). `docker-publish.yml`
builds and pushes three images (api, worker, web) to GHCR on `main`/tags.
`security-scan.yml` adds CodeQL and `pnpm audit`. Four deployment paths
(`docker-compose.yml`, `deploy/k8s/`, `deploy/linux/`, `deploy/windows/`) run
the identical application artifact — the same Docker images or the same
`pnpm build` output — so behavior doesn't depend on which is chosen; see
`deploy/README.md` for the comparison table and what's genuinely
production-hardened (the API/worker tier's HA story) versus a documented
starting point (Postgres itself has no built-in HA in any of these
manifests — see `deploy/k8s/03-postgres.yaml`'s closing comment).

### 14. Migration history gap, disclosed and worked around, not silently ignored

`apps/api/prisma/migrations/` only has real migration files through Module
5 (`20260501000000_ai_security_copilot`) — every schema change from Module 6
onward, including all of Module 10's, was authored directly in
`schema.prisma` without a corresponding `prisma migrate dev` run, because
the sandboxed development environment for this session had no live database
connection to generate migrations against. This is a real, disclosed gap:
`prisma migrate deploy` (the correct production migration command) cannot
be used against this repository's actual migration history past Module 5.
Every deployment path in this module instead documents `prisma db push`
(applies the current schema state directly, no migration history required)
for first-time setup, and `docs/deployment`/`deploy/README.md` both
explicitly recommend generating a real baseline migration
(`prisma migrate dev --name module_10_baseline`, run once locally against a
disposable database) before any team adopts `migrate deploy` for ongoing
schema changes going forward.

## Consequences

- **Genuinely new capability, zero breakage.** Every one of the fourteen
  subsystems is additive — no Module 1-9 route, DTO shape, or database
  column was renamed, dropped, or had its meaning changed. Backward
  compatibility holds by construction (additive Prisma schema changes,
  new endpoints/modules registered alongside existing ones in
  `app.module.ts`) not by a separate compatibility test suite.
- **Multiple disclosed, narrower-than-ideal v1 scopes**, each documented at
  its point of implementation rather than silently shipped as if complete:
  Plugin sandboxing is contractual, not runtime-enforced; Compliance
  auto-deletion covers two resource types, not all of them; tracing
  `withSpan()` coverage is two call sites, not exhaustive; the three SDKs
  are hand-verified against shared DTOs but only the Go SDK has ever been
  compiled (in CI, for the first time, via this module's own `ci.yml`).
  Each of these is a legitimate scope boundary for a single module pass,
  not a defect, but a team building on this platform should treat this
  ADR's "disclosed scope" language as a literal list of next steps, not
  boilerplate.
- **One genuine architectural risk carried forward on purpose**: Postgres
  itself is a single point of failure in every deployment path documented
  here unless the operator supplies a managed HA offering or a Postgres
  operator. Making every *application-tier* poller safe to run at N
  replicas (point 11) doesn't help if the one database backing all of them
  is down — this is called out explicitly in three places
  (`03-postgres.yaml`, `deploy/README.md`, this ADR) specifically so it
  isn't mistaken for a solved problem.
- **The migration-history gap (point 14) is the one item here that a real
  team must actively resolve**, not just be aware of, before this becomes a
  long-running production system with a schema that changes over time
  through normal `migrate deploy` operations rather than one-off `db push`
  calls.
