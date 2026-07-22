# Module 10 Release Notes — Enterprise Platform + SaaS + Global Infrastructure

Full decision record: `docs/adr/0010-enterprise-platform.md`.
Implementation record: `docs/modules/10-enterprise-platform.md`.
Deployment guide: `deploy/README.md`.

## Features added

**Multi-tenancy & RBAC** — `Organization`/`OrganizationMember`/`Team` sit
above the existing `Workspace` tenant boundary without changing it;
organization-level RBAC roles extend Module 1's workspace-level
`Role`/`Permission` model.

**Distributed Job System** — `DistributedJob`/`WorkerNode`/`JobEvent`, a
claim-based work queue on Postgres (no new message broker), worker
register/heartbeat/claim/complete/fail routes, and `GetQueueMetricsQuery`
(also exposed as a Prometheus endpoint — see Observability below).

**Plugin Marketplace** — `Plugin`/`PluginVersion`/`PluginInstallation`, a
capability-scoped permission model (installing admins explicitly accept
each plugin's declared permissions), hook execution via
`ExecutePluginHookCommand`. Sandboxing today is contractual (declared
permissions), not a separate execution runtime — disclosed as a concrete
follow-up before accepting untrusted third-party plugins in production.

**Integrations framework** — `IntegrationConnection` + a static
`IntegrationCapability` registry per provider; every provider action routes
through one generic `ExecuteIntegrationActionCommand`, which is what lets
the new Automation Engine (below) integrate with any connected provider
without a per-provider dependency.

**Team Workspaces** — links existing `Workspace`s to a `Team` under an
`Organization` for enterprise collaboration.

**Enterprise Reporting** — `EnterpriseReport`/`ReportSchedule`,
`ReportContentBuilderService` as the single content-computation path shared
by on-demand generation and the new scheduled-report poller.

**Enterprise Analytics** — organization-scoped, read-time aggregation
endpoints.

**API Platform**:
- **GraphQL** — a full schema over the existing shared DTOs, with
  env-gated introspection/playground (`GRAPHQL_PLAYGROUND_ENABLED`).
- **Webhooks, expanded** — `WebhookDelivery` (new: real delivery tracking,
  retry/backoff, redelivery) on top of the existing `WebhookToken` model;
  corrected `WEBHOOK_EVENT_TYPES` catalog to match real domain-event verb
  strings (the original catalog never matched any real event); a new
  `WebhookDispatchHandler` actually publishes to it now — closing a Module
  9 gap where the webhook subscription mechanism existed but nothing fired
  it.
- **SDKs** — TypeScript, Python, and Go client libraries, hand-written
  against `packages/shared`'s endpoint/DTO definitions. A cross-reference
  audit mid-module caught and fixed several drifted fields in the Go SDK
  (`QueueMetrics`' shape, a mis-tagged `FinishedAt` field, a phantom
  `PluginInstallation.Status` field) — see `sdks/go/README.md`.

**Workflow Automation Engine** — `Workflow`/`WorkflowRun`/`WorkflowStepLog`,
a nine-step-kind interpreter (`recon`, `scan`, `report`, `notify`,
`ai_analysis`, `create_ticket`, `sync_data`, `condition`, `loop`, `delay`)
with real integration into the Reporting, Notifications, AI, and
Integrations subsystems — not a stub. `recon`/`scan` steps honestly record
intent rather than fabricating jobs from incomplete parameters, matching
Module 9's `ScheduledJobRunnerService` precedent.

**Compliance** — `DataRetentionPolicy` (auto-enforced for
`API_REQUEST_LOG`/`WEBHOOK_DELIVERY`, logged-and-skipped for other resource
types), `BackupPolicy` (real metadata-snapshot backups via the existing
`StorageService`), `ComplianceExportRequest` (a real GDPR export pipeline —
a mid-implementation privacy bug where an org admin's export could have
leaked every user's audit trail system-wide was caught and fixed before
this shipped).

**Observability** — a hand-rolled Prometheus metrics registry
(`/observability/metrics`, plus a per-organization queue-metrics endpoint
with mandatory token auth), real OpenTelemetry distributed tracing on two
representative call sites, structured JSON logging replacing the default
console logger, and liveness/readiness health endpoints
(`/observability/health`, `/observability/health/ready`) suitable for
container-orchestrator health checks.

**High Availability + Performance** — every Module 9/10 background poller
(seven services) is now safe to run at any replica count via a new
Postgres-row-based distributed lease (`PollerLeaseService`), closing a
previously-documented "pin to a single replica" limitation. Graceful
shutdown (`app.enableShutdownHooks()`) and a tunable database connection
pool size (`DATABASE_POOL_MAX`) round out this pass.

**Security Hardening** — `helmet()`'s configuration was tuned with an
explicit CSP (fixing a real bug where the prior bare default would have
broken Swagger UI), HSTS, and clickjacking protection.

**CI/CD** — GitHub Actions workflows for lint/typecheck/test/build (with a
real Postgres+pgvector service container), Docker image publishing to GHCR,
and CodeQL + dependency-audit security scanning. This is the first
environment in this project's history with an actual Go toolchain — the Go
SDK's `go build`/`go vet`/`go test` finally run for real here.

**Production Deployment** — four deployment paths (Docker Compose,
Kubernetes with HPA, Linux systemd, Windows Services via NSSM) running
identical application artifacts, documented in `deploy/README.md` alongside
an explicit accounting of what's genuinely production-hardened by the
application itself versus what remains a deployment-specific
responsibility (Postgres HA, TLS termination).

## Database changes

All additive — new tables/enums/columns only, consistent with every prior
module:

- New tables: `Organization`, `OrganizationMember`, `Team`,
  `DistributedJob`, `WorkerNode`, `JobEvent`, `Plugin`, `PluginVersion`,
  `PluginInstallation`, `IntegrationConnection`, `EnterpriseReport`,
  `ReportSchedule`, `WebhookDelivery`, `Workflow`, `WorkflowRun`,
  `WorkflowStepLog`, `DataRetentionPolicy`, `BackupPolicy`,
  `ComplianceExportRequest`, `PollerLease`.
- New enums: `WebhookDeliveryStatus`, plus one new
  `AuditEventType`/`BugBountyNotificationType` value each
  (`WEBHOOK_DELIVERY_REDELIVERED`, `WORKFLOW_ALERT`).
- Modified existing tables: `WebhookToken` gained a `deliveries` relation;
  `Workflow` gained `nextRunAt`; `WorkflowRun` gained
  `contextJson`/`pausedAtStepKey`/`resumeAt` — all new nullable/defaulted
  columns, no existing column changed shape or meaning.

**Known gap, disclosed**: `apps/api/prisma/migrations/` has no migration
file capturing any of the above — this module's schema changes (like
Modules 6-9's before it) were authored directly in `schema.prisma` without
a live database to run `prisma migrate dev` against in this sandbox. See
`deploy/README.md`'s "Common prerequisites" section for the `prisma db
push` workaround and the recommended path to a real migration baseline
going forward.

## Verification status

`packages/shared` compiles cleanly (`npx tsc --noEmit`, run repeatedly
throughout this module). `apps/api`'s full typecheck/build/test suite could
not be run to completion in this sandbox (large monorepo `tsc` exceeded the
environment's command timeout; the newly-added `@opentelemetry/*`
dependencies were never `pnpm install`'d here — no registry network access).
Every file in this module was manually re-verified after editing — imports,
Prisma field names cross-checked directly against `schema.prisma`, and
architectural consistency with Modules 1-9. The new `ci.yml` GitHub Actions
workflow is the first real, automated verification this code will receive;
treat its first run against this branch as the authoritative check the
sandbox couldn't perform.

See `docs/adr/0010-enterprise-platform.md`'s Consequences section for the
full list of disclosed v1 scope boundaries (Plugin sandboxing, Compliance
auto-deletion scope, tracing coverage, SDK verification depth) and the one
outstanding architectural risk (no built-in Postgres HA in any documented
deployment path).
