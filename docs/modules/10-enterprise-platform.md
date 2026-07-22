# Module 10 — Enterprise Platform + SaaS + Global Infrastructure

Decision record: `docs/adr/0010-enterprise-platform.md`.
Release notes: `docs/releases/module-10-release-notes.md`.
Deployment guide: `deploy/README.md`.

Implementation record for all fourteen subsystems, in build order. Each
section lists the primary files — see the files themselves for full
doc-comment-level detail; this is an index, not a duplicate of that detail.

## 1. Multi-tenant architecture

- `Organization`, `OrganizationMember`, `Team` (Prisma models) — sits above
  `Workspace`, doesn't replace it (see ADR §1).
- `apps/api/src/modules/enterprise/` — organization CRUD, membership.

## 2. RBAC & ABAC expansion

- Organization-level roles distinct from Module 1's Workspace-level
  `Role`/`Permission` tables.
- `apps/api/src/modules/rbac/` extensions for org-scoped authorization.

## 3. Distributed Job System

- `DistributedJob`, `WorkerNode`, `JobEvent` (Prisma).
- `apps/api/src/modules/distributed-jobs/` — claim-based queue (ADR §2),
  worker register/heartbeat/claim/complete/fail routes, `GetQueueMetricsQuery`
  (also the basis for the Observability Prometheus queue-metrics endpoint).

## 4. Plugin Marketplace

- `Plugin`, `PluginVersion`, `PluginInstallation` (Prisma).
- `apps/api/src/modules/plugins/` — registry, install/uninstall, hook
  execution (`ExecutePluginHookCommand`). Sandboxing is contractual, not
  runtime — see ADR §3.

## 5. Integrations framework

- `IntegrationConnection` (Prisma); `IntegrationCapability` is a static
  registry, not a table.
- `apps/api/src/modules/integrations/` — connect/disconnect/test,
  `ExecuteIntegrationActionCommand` (the generic executor every other
  subsystem's "do something in a third-party tool" need routes through —
  see ADR §4).

## 6. Team Workspaces

- `apps/api/src/modules/team-workspace/` — links `Workspace` to `Team`
  under an `Organization`.

## 7. Enterprise Reporting

- `EnterpriseReport`, `ReportSchedule` (Prisma).
- `apps/api/src/modules/enterprise-reporting/` —
  `ReportContentBuilderService` (single content-computation path, ADR §5),
  `ReportScheduleRunnerService` (poller, HA-leased — see §11 below).

## 8. Enterprise Analytics

- `apps/api/src/modules/enterprise-analytics/` — read-time aggregation
  queries, organization-scoped (ADR §5).

## 9. API Platform (GraphQL, Webhooks, SDKs)

- **GraphQL**: `apps/api/src/modules/graphql-api/` — Apollo/NestJS GraphQL,
  resolvers return the same shared DTOs the REST controllers do (ADR §6).
  Introspection/playground gated by `GRAPHQL_PLAYGROUND_ENABLED`.
- **Webhooks**: `WebhookDelivery` (Prisma, new — `WebhookToken` itself
  predates this module). `apps/api/src/modules/public-api/webhooks/` —
  `webhook-signature.util.ts` (HMAC signing, event-key normalization),
  `webhook-dispatch.handler.ts` (enqueue, `@EventsHandler` over ~25 event
  classes), `webhook-delivery-queue.service.ts` (async delivery, backoff,
  HA-leased). See ADR §7 for the enqueue/deliver split.
- **SDKs**: `sdks/typescript` (`packages/sdk-typescript`), `sdks/python`,
  `sdks/go` — hand-written against `packages/shared/src/*-endpoints.ts`.
  See each SDK's own README for verification status; the Go SDK's fields
  were caught drifted from the real DTOs during a cross-reference audit
  mid-module (wrong `QueueMetrics` shape, `DistributedJob.CompletedAt`
  should be `FinishedAt`, a phantom `PluginInstallation.Status` field) —
  fixed, documented in that README's "Field-audited" section, and now
  actually compiled for the first time by `ci.yml`'s `go-sdk` job.

## 10. Workflow Automation Engine

- `Workflow`, `WorkflowRun`, `WorkflowStepLog` (Prisma).
- `apps/api/src/modules/automation-engine/` —
  `workflow-definition.schema.ts` (Zod validation + graph-invariant
  checks), `services/workflow-executor.service.ts` (nine step kinds, ADR
  §8), `services/workflow-runner.service.ts` (trigger/resume poller,
  HA-leased).

## 11. Compliance

- `DataRetentionPolicy`, `BackupPolicy`, `ComplianceExportRequest` (Prisma).
- `apps/api/src/modules/compliance/` — `data-retention-enforcer.service.ts`
  (two auto-enforced resource types, ADR §9), `backup-policy-runner.service.ts`
  (metadata snapshot backups via `StorageService`), `compliance-export-processor.service.ts`
  (GDPR export — org-membership-filtered `AuditEvent` query, fixed mid-module
  after catching the original unfiltered version). All three pollers are
  HA-leased.

## 12. Observability

- `apps/api/src/observability/` — `tracing.ts` (OpenTelemetry SDK,
  `withSpan()`), `structured-logger.service.ts`, `request-id.middleware.ts`.
- `apps/api/src/modules/observability/` — `metrics-registry.service.ts`
  (hand-rolled Prometheus `Counter`/`Histogram`), `http-metrics.interceptor.ts`
  (global `APP_INTERCEPTOR`), `controllers/health.controller.ts`
  (liveness/readiness), `controllers/metrics.controller.ts` (global +
  per-org Prometheus endpoints, two-tier token requirement — ADR §10).
  `observability.module.ts` wires all of this into `app.module.ts`;
  `main.ts` calls `startTracing()` and passes `StructuredLoggerService` to
  `NestFactory.create`.

## 13. High Availability + Performance

- `PollerLease` (Prisma, new — `apps/api/src/common/concurrency/poller-lease.service.ts`).
  Every Module 9/10 `setInterval` poller (`ScheduledJobRunnerService`,
  `ReportScheduleRunnerService`, `WebhookDeliveryQueueService`,
  `WorkflowRunnerService`, `DataRetentionEnforcerService`,
  `BackupPolicyRunnerService`, `ComplianceExportProcessorService`) now gates
  its tick through `PollerLeaseService.withLease()` — see ADR §11 for the
  compare-and-swap design and why it was chosen over Postgres advisory
  locks.
- `main.ts`: `app.enableShutdownHooks()` for graceful `SIGTERM` handling.
- `DATABASE_POOL_MAX` (`env.validation.ts`) wired into `PrismaService`'s
  `PrismaPg` adapter — explicit, tunable per-replica connection pool size.

## 14. Security Hardening

- `bootstrap.ts`'s `configureApp()`: tuned `helmet()` CSP (fixes Swagger UI,
  which the prior bare default would have broken), explicit HSTS
  (`includeSubDomains`, no `preload`), explicit `frameguard: deny` — see
  ADR §12.

## CI/CD

- `.github/workflows/ci.yml` — lint/typecheck/test/build across the
  Turborepo workspace, `pgvector/pgvector` Postgres service for `apps/api`
  tests, dedicated Python/Go SDK jobs.
- `.github/workflows/docker-publish.yml` — builds/pushes `api`/`worker`/`web`
  images to GHCR.
- `.github/workflows/security-scan.yml` — CodeQL (`security-extended` query
  pack) + `pnpm audit`.

## Production Deployment

- `docker-compose.yml` (repo root) — single-machine reference deployment.
- `deploy/k8s/` — Kubernetes manifests: namespace, ConfigMap/Secret,
  optional self-managed Postgres StatefulSet (explicitly not HA — see that
  file's closing comment), api/worker/web Deployments (api has an HPA,
  `replicas: 3` reference topology), Ingress.
- `deploy/linux/` — systemd units + `install.sh` for a bare-metal/VM
  deployment without Docker.
- `deploy/windows/` — `install-service.ps1`, registers NSSM-wrapped Windows
  Services.
- `deploy/README.md` — comparison table across all four paths, common
  prerequisites, and an explicit list of what's genuinely production-
  hardened by the application itself versus what remains a per-deployment
  responsibility (Postgres HA, TLS termination).

## Verification status

`packages/shared` was verified via `npx tsc --noEmit` after every schema/DTO
change in this module and compiles cleanly. `apps/api`'s full `tsc --noEmit`
could not be completed in this sandbox within the environment's command
timeout, and the newly-added `@opentelemetry/*` packages were never
`pnpm install`'d here (no registry network access) — both are the same
class of disclosed, sandbox-specific constraint every module since the
GraphQL API subsystem has carried (see that subsystem's own verification
note). Every file touched in this module was manually re-read after editing
for import correctness, Prisma field-name accuracy (cross-referenced against
`schema.prisma` directly, not assumed), and consistency with the patterns
established in Modules 1-9. `ci.yml` is the first environment in this
project's history that will actually run `tsc`, `jest`, `go build`/`go
vet`/`go test`, and `pytest` against this code — treat its first real run
as the authoritative verification pass this sandbox could not perform.
