# Module 14 — Cloud Platform, Enterprise SaaS & High Availability

Decision record: `docs/adr/0014-cloud-platform-enterprise-saas-ha.md`.
Release notes: `docs/releases/module-14-release-notes.md`. Three
subsystems (API Gateway, Auto Update, CI/CD) and two dedicated review
passes (Performance, Community Edition guarantee) already have their own
focused documents and are only summarized here, with pointers:
`docs/architecture/api-gateway.md`, `docs/architecture/auto-update.md`,
`docs/architecture/ci-cd.md`, `docs/reviews/0006-module-14-performance-review.md`,
`docs/reviews/0007-module-14-community-edition-guarantee.md`.

## 1. Prisma schema

`apps/api/prisma/schema.prisma`, migration
`20260901000000_cloud_platform_enterprise_infrastructure`. No new
`Tenant` model — Module 10's `Organization` *is* the tenant; Module 14
extends it with 8 billing/branding columns (`billingEmail`,
`billingProviderCustomerId`, `subscriptionStatus`, `subscriptionRenewsAt`,
`customDomain`, `customDomainVerifiedAt`, `brandingPrimaryColor`,
`brandingFaviconUrl`) rather than a parallel table. New: `License`
(`LicenseEdition`: `COMMUNITY`/`ENTERPRISE`; `LicenseStatus`:
`ACTIVE`/`EXPIRED`/`REVOKED`) and `BackupRun` (`BackupScope`:
`DATABASE`/`STORAGE`/`CONFIGURATION`/`FULL`; `BackupRunStatus`:
`PENDING`/`RUNNING`/`SUCCEEDED`/`FAILED`; `BackupTrigger`:
`SCHEDULED`/`MANUAL`). `BackupPolicy` (already existed) gained `scope`,
`encrypt`, `lastPrunedAt`. `WorkerNode` gained `version String?` (Auto
Update — see §9).

## 2. Shared package types + env config

`packages/shared/src/infrastructure.ts` + `infrastructure-endpoints.ts`
(new) — `Edition`, `LivenessDto`, `EditionInfoDto`, `LicenseDto`,
`ActivateLicenseRequestDto`, `ProviderKind`, `QueueDashboardDto`,
`CacheDashboardDto`, `StorageDashboardDto`, `DatabaseDashboardDto`,
`ClusterLeaseDto`, `ClusterOverviewDto`. Tenant/billing/branding types
were folded into the existing `enterprise.ts`
(`UpdateTenantBillingRequestDto`, `UpdateTenantBrandingRequestDto`,
`TenantUsageDto`) rather than a new file, since they extend
`OrganizationsController`'s existing surface. Backup DTOs folded into
`compliance.ts`/`compliance-endpoints.ts`
(`BackupRunDto`, `TriggerBackupRequestDto`,
`BackupRestoreInstructionsDto`, `BACKUP_RUN_ENDPOINTS`).
`distributed-jobs.ts` gained `DISTRIBUTED_JOB_TYPE_CATEGORIES` (9
categories: recon, scanning, ai-job, report, automation, notification,
sync, desktop-job, plugin-task) and `WorkerNodeDto.version`.
`env.validation.ts` gained the provider-selection and backup/logging/
security env vars listed in §4-§9 and §13 below.

## 3. Edition system (Community vs. Enterprise gating)

`apps/api/src/modules/infrastructure/edition.service.ts` —
`EditionService`: `getEdition()`, `isEnterprise()`,
`isEnterpriseFor(organizationId?)`, `getActiveLicense(organizationId?)`,
`getInfo(organizationId?)`. Registered `@Global()` via
`infrastructure.module.ts` so every module can inject it without an
explicit import. Reads `PENTESTHUB_EDITION` (default `community`) and,
at most, a local `License` row count — no network call, ever (see ADR
0014 §7 and the Community Edition guarantee review). Gating primitives:
`apps/api/src/common/guards/edition.guard.ts` (`EditionGuard`, global
`APP_GUARD`) + `apps/api/src/common/decorators/requires-edition.decorator.ts`
(`@RequiresEdition('enterprise')`) — a deployment with zero `License`
rows is treated as a **trusted, permitted** environment for everything
except the specific Enterprise-only routes this decorator marks, so a
Community deployment is never locked out of anything it already had.
`GET infrastructure/edition`, `POST infrastructure/license/activate`,
`DELETE infrastructure/license/:id` (`edition.controller.ts`).

## 4. Deployment artifacts

`deploy/k8s/` — twelve manifests: namespace, ConfigMap, Secret example,
Postgres StatefulSet, api/worker/web Deployments, optional Redis/MinIO
(`13-redis.yaml`/`14-minio.yaml`, Enterprise-overlay-only), Ingress +
optional cert-manager Certificate. `deploy/installer/` — a full
install/configure/backup/upgrade/rollback/health-check lifecycle as
shell scripts (`install.sh`, `quick-install.sh`, `configure.sh`,
`backup-wizard.sh`, `upgrade.sh`, `rollback.sh`, `health-check.sh`,
`recovery-test.sh`, shared helpers in `lib.sh`). `deploy/linux/` and
`deploy/windows/` (Module 10 originals) round out the four deployment
paths documented in `deploy/README.md`.

## 5. High Availability

No new consensus mechanism — `apps/api/src/common/concurrency/poller-lease.service.ts`'s
`PollerLeaseService` (Module 10's Postgres-row-based lease for seven
single-replica-bound pollers) is generalized in this module's own
documentation as "already a general-purpose distributed lock /
leader-election primitive" and extended with `getInstanceId()`,
`listLeases(): Promise<ClusterLeaseDto[]>` (feeds the Admin Console's
cluster visibility, §10), and `onModuleDestroy()` (proactively releases
the lease on graceful shutdown so a `SIGTERM`'d replica doesn't hold a
lease until TTL expiry, shortening real failover time). See ADR 0014 §2
for why this extends rather than replaces Module 10's primitive.

## 6. Distributed Workers extensions

`apps/api/src/modules/distributed-jobs/` — heartbeat staleness detection
(`worker-health.util.ts`'s `isWorkerStale()`), crash recovery
(`worker-reaper.service.ts`'s `WorkerReaperService`, marking stale
`WorkerNode`s `UNHEALTHY` and migrating their orphaned `DistributedJob`s),
and priority scheduling (`job-scheduling.util.ts`'s `PRIORITY_ORDER`)
were already present from Module 10 and confirmed satisfying this
module's checklist item rather than rebuilt. The genuinely new pieces
this module added: `DISTRIBUTED_JOB_TYPE_CATEGORIES` (a canonical
vocabulary for grouping job types, feeding the Admin Console's per-
category queue view) and `WorkerNode.version` reporting on heartbeat
(`worker-nodes.commands.ts`'s `HeartbeatWorkerNodeHandler`, Auto Update
integration — see §9).

## 7. Queue / Cache / Storage abstractions

`apps/api/src/common/providers/` — one interface per seam, selected at
DI-wiring time by `providers.module.ts` (`@Global() ProvidersModule`)
based on `QUEUE_PROVIDER`/`CACHE_PROVIDER`/`STORAGE_PROVIDER`:

- **Queue** — `queue/queue-service.interface.ts` (`QueueService`).
  `in-memory-queue.service.ts` (default) / `redis-queue.service.ts`.
- **Cache** — `cache/cache-service.interface.ts` (`CacheService`).
  `memory-cache.service.ts` (default) / `redis-cache.service.ts` /
  `disk-cache.service.ts`.
- **Storage** — `storage/storage-service.interface.ts`
  (`StorageService`) — extended in this module with `download`/`list`/
  `exists` on top of Module 1's `upload`/`getUrl`/`delete`.
  `local-disk-storage.service.ts` (default) /
  `s3-compatible-storage.service.ts` (MinIO/S3/R2-compatible).

DI tokens centralized in `providers/tokens.ts`
(`QUEUE_SERVICE`/`CACHE_SERVICE`/`STORAGE_SERVICE`/`MAIL_SERVICE`). Every
consumer (Distributed Job System, the new `CacheResponseInterceptor` from
§9's API Gateway work, evidence/attachment uploads) depends on the
interface only — see ADR 0014 §1 for why this is a hard rule, not a
convenience.

## 8. Database support

Connection pooling: `DATABASE_POOL_MAX`/`WORKER_DATABASE_POOL_MAX` size
Prisma's pool per api/worker replica (already present from Module 10's
HA work, documented for the first time against real replica-count math
in `deploy/k8s/01-configmap.yaml`'s comments this module). Read-replica
routing: optional `DATABASE_READ_REPLICA_URL` +
`DATABASE_READ_REPLICA_POOL_MAX`, falling back to the primary when unset.
Migration validation: `apps/api/scripts/validate-migrations.mjs` — step 1
(`prisma validate`, schema-only, always runs) + step 2/3 (`prisma migrate
diff --exit-code` against a real database when `DATABASE_URL` is set,
informational drift reporting rather than a hard failure, matching this
repository's disclosed migration-history gaps since Module 10). Wired
into CI as the `migrate-validate` job in `ci.yml` (see
`docs/architecture/ci-cd.md`).

## 9. Observability, monitoring & centralized logging

Health/liveness/readiness (`observability/controllers/health.controller.ts`,
Module 10 origin) gained a `version` field on `GET observability/health`
this module, read from `npm_package_version` (Auto Update, §9 of the
ADR). Prometheus (`metrics.controller.ts`, `metrics-registry.service.ts`)
and OpenTelemetry tracing (`apps/api/src/observability/tracing.ts`) were
already real from Module 10; this module adds the operational config to
actually run them: `deploy/prometheus/{prometheus.yml,alerts.yml,
alertmanager.yml}`, `deploy/grafana/provisioning/{datasources,dashboards}/`
with a starter dashboard, and `docker-compose.monitoring.yml` as an
optional overlay (see `deploy/prometheus/README.md` for why this repo
relies on `prometheus.io/*` Service annotations plus a cluster's own
kube-prometheus-stack on Kubernetes rather than shipping bundled
manifests there).

Centralized logging (new this module, `apps/api/src/observability/` —
distinct from `apps/api/src/modules/observability/`):
`structured-logger.service.ts`'s `StructuredLoggerService` (JSON-lines,
honors `LOG_LEVEL`/`LOG_FORMAT=json|pretty`, includes the request ID),
`request-context.ts` (`AsyncLocalStorage`-based `requestContextStorage`,
`getRequestId()`), `request-id.middleware.ts` (assigns/propagates
`X-Request-Id`, wraps every request in the async-local context). Slow-query
logging lives in `prisma.service.ts` (a dedicated `SlowQuery` logger over
Prisma's `emit: 'event'` query events, threshold from
`SLOW_QUERY_THRESHOLD_MS`). Audit logging (`modules/audit/`) predates this
module (Module 1/9); security-relevant enforcement (`ip-allowlist.guard.ts`,
`mtls.guard.ts`) is covered in §11.

## 10. Backup system & disaster recovery

`apps/api/src/modules/backups/` — `BackupService`: `trigger()`/
`runByScope()` dispatching to `runDatabaseBackup()` (real `pg_dump -Fc`,
gzip, optional AES-256-GCM encryption via `BACKUP_ENCRYPTION_KEY`),
`runConfigurationBackup()`, `runStorageBackup()` — every backup writes
through the same `StorageService` seam as everything else (§7), so a
backup lands on local disk by default and only reaches S3-compatible
storage if that provider is already configured. `verify()` re-checksums
a stored backup (`checksumSha256`); `list()`/`get()`/`downloadArchive()`/
`restoreInstructions()` round out the surface via
`controllers/backups.controller.ts`
(`backups/:organizationId/runs[/:id[/download|/restore-instructions|/verify]]`).
Disaster recovery is deliberately documentation-plus-tooling, not a
re-implementation of Postgres HA: `deploy/installer/recovery-test.sh`
exercises a real restore against a disposable database; point-in-time
recovery itself is called out as a Postgres-operator/managed-service
responsibility, consistent with `deploy/README.md`'s standing disclosure
that this repository does not make Postgres itself highly available.

## 11. Security

`docs/security/{permission-matrix,secrets-management,tls-mtls-certificates,
waf-compatibility}.md` (this module) cover, respectively: the full RBAC/
ABAC permission matrix, an inventory of every secret this platform uses
and what rotation means for each, TLS/mTLS termination and rotation per
deployment path plus `apps/api/src/common/guards/mtls.guard.ts`
(`MtlsGuard`, opt-in via `MTLS_REQUIRED`, defaults off, first tested this
module by `mtls.guard.spec.ts` — see §16), and the false-positive traps a
generic WAF hits on this platform's own traffic. IP allow lists
(`IP_ALLOWLIST`, `ip-allowlist.guard.ts`) and trusted-proxy configuration
(`TRUST_PROXY_HOPS`) are enforced directly by the API, both defaulting
off/permissive.

## 12. Admin Console

Not a standalone module directory — the `infrastructure` module's
`controllers/cluster-overview.controller.ts` (`ClusterOverviewController`,
`ClusterOverviewService.getOverview()`): one
`GET infrastructure/admin/cluster-overview` call aggregating cluster
leases (§5), workers/queue depth (§6-7), cache/storage/database
dashboards (§7-8), backups (§10), plugin/update state (§9 of the ADR,
Auto Update), and licensing (§3) into a single `ClusterOverviewDto` —
deliberately a read/action surface over state other subsystems already
persist, not a second source of truth (ADR 0014 §6).

## 13. Tenant management (Enterprise-only)

Extends `apps/api/src/modules/enterprise/controllers/organizations.controller.ts`
rather than a new module: `PATCH enterprise/organizations/:id/billing`,
`PATCH enterprise/organizations/:id/branding`,
`GET enterprise/organizations/:id/usage` — all `@RequiresEdition('enterprise')`
(§3). Commands/queries: `organizations.commands.ts`
(`UpdateTenantBillingCommand`, `UpdateTenantBrandingCommand`),
`organizations.query.ts` (`GetTenantUsageQuery`). The billing webhook
(`controllers/billing-webhook.controller.ts`) is intentionally inert
without configuration: `BILLING_WEBHOOK_SECRET` is optional, and unset
the endpoint exists but rejects every request with 401 — no specific
billing provider is hardcoded (see the Community Edition guarantee
review, finding 4).

## 14. API Gateway

`@CacheResponse(ttlSeconds)` + `CacheResponseInterceptor` — opt-in,
per-route, GET-only response caching over the `CacheService` abstraction
(§7), user-namespaced cache keys. Full detail, including the
interceptor-nesting/guard-composition reasoning and the deliberate
no-invalidation-on-write trade-off:
`docs/architecture/api-gateway.md`.

## 15. Auto Update

Per-client update/version-check story: API/worker (deploy-time
versioning, `version` on the health endpoint — §9), web (a polling hook
+ dismissible banner, never auto-reloads), CLI (`pentesthub version`/
`update` — prints instructions, never self-replaces), mobile
(store-policy-compliant check-only), Desktop Agent (Module 7's existing
Tauri updater, no-rollback gap disclosed), plugins (existing
upgrade-as-rollback pattern, a new query surfaces when to use it). Full
detail: `docs/architecture/auto-update.md`.

## 16. CI/CD

GitHub Actions across PR validation (`ci.yml`) and release/deployment
(`release.yml`, `docker-publish.yml`, `desktop-ci.yml`,
`mobile-ci.yml`, `security-scan.yml`) — build/lint/typecheck/test,
Turborepo caching, Docker builds with BuildKit-native SBOM/provenance,
Trivy scanning, cosign keyless signing, CycloneDX SBOM at release time,
secret-gated npm/PyPI publishing, and DB migration validation (§8). Full
pipeline inventory, secrets/variables table, and disclosed gaps:
`docs/architecture/ci-cd.md`.

## 17. Performance optimizations pass

One real N+1 found and fixed:
`GetAvailablePluginUpdatesHandler` (`apps/api/src/modules/plugins/queries/plugin-installations.query.ts`)
rewritten from one `pluginVersion.findFirst` per installation to two
total queries (`pluginInstallation.findMany` + one `pluginVersion.findMany`
over the distinct set of installed `pluginId`s, reduced to "latest per
plugin" in memory), backed by a new `@@index([pluginId, publishedAt])`
on `PluginVersion`. Full review, including a documented-but-not-yet-fixed
scaling concern in `ClusterOverviewService`'s historical aggregation:
`docs/reviews/0006-module-14-performance-review.md`.

## 18. Community Edition guarantee pass

Audited seven areas (provider defaults, `EditionService` network
independence, `docker-compose.yml` self-hosted-by-default, billing
webhook optionality, K8s manifest cloud-neutrality, no hardcoded paid
endpoints, mTLS/IP-allowlist default-off) — guarantee holds. One real bug
found and fixed in the process: `deploy/k8s/01-configmap.yaml` shipped
`QUEUE_PROVIDER: "in-memory"`, which doesn't match `env.validation.ts`'s
zod enum (`"memory" | "redis"`) and would have failed `validateEnv()` at
boot as shipped — fixed to `"memory"`. Full audit:
`docs/reviews/0007-module-14-community-edition-guarantee.md`.

## 19. Tests

First guard spec in this codebase (`apps/api/src/common/guards/mtls.guard.spec.ts`,
4 cases) and first interceptor spec
(`apps/api/src/common/interceptors/cache-response.interceptor.spec.ts`,
5 cases), both hand-rolling mocks consistent with this codebase's
established convention (no `@nestjs/testing`'s `Test.createTestingModule`
anywhere in this project). A new spec for the N+1 fix in §17
(`apps/api/src/modules/plugins/queries/plugin-installations.query.spec.ts`,
5 cases) asserts the fix's core property directly: `pluginVersion.findMany`
is called exactly once regardless of installation count, plus coverage
for already-up-to-date installations, plugins with zero non-deprecated
versions, the zero-installations early return, and non-member rejection.
`packages/cli` remains without jest infrastructure — a pre-existing,
disclosed gap (`docs/architecture/ci-cd.md`'s "Known gaps" section) that
this pass scoped out rather than silently dropped, since adding it would
require net-new jest config from scratch with no existing pattern in
that package to follow.

## 20. Verification

See ADR 0014 §11 and this module's release notes for the full sandbox
verification-constraints disclosure (network degradation, the missing
`turbo` package, filesystem-I/O-latency-induced `tsc`/`prisma` hangs, no
Docker/kubectl) and the exact commands required on a normal development
machine to complete verification before merging.
