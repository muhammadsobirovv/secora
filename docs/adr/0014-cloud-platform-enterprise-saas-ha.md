# ADR 0014 — Cloud Platform, Enterprise SaaS & High Availability

## Status

Accepted (source-complete; verification loop constrained by sandbox
toolchain limits, of a different shape than prior modules — see §11).

## Context

Modules 1-13 built a full pentest/bug-bounty product with three
first-class clients and a Module 10 "Enterprise Platform" pass that
already introduced multi-tenancy, a Distributed Job System, and four
deployment paths. What Module 10 left as a starting point rather than a
finished story — disclosed explicitly in its own release notes — is
everything that turns "the application runs" into "the application
survives a node failure, scales horizontally, backs itself up, updates
itself safely, and ships through a real pipeline instead of a manual
`docker build`." Module 14 closes that gap: pluggable infrastructure
abstractions (queue/cache/storage), real distributed-worker resilience,
backup/disaster-recovery, an infrastructure Admin Console, Enterprise-only
tenant management, an API Gateway, cross-client auto-update, and
production-grade CI/CD — all while holding a non-negotiable constraint
carried over from every prior module's Community Edition posture: **no
mandatory paid service, self-hosted deployment fully functional, external
cloud services always optional.**

## Decisions

**1. Provider abstractions, not a forced migration to managed
infrastructure.** Three seams — `QUEUE_PROVIDER` (`memory` | `redis`),
`CACHE_PROVIDER` (`memory` | `redis` | `disk`), `STORAGE_PROVIDER`
(`local` | `s3`) — each default to the zero-external-dependency binding.
`apps/api/src/common/providers/` defines one interface per seam
(`QueueService`, `CacheService`, `StorageService`) with every consumer
(distributed jobs, HTTP response caching, evidence/attachment uploads)
coded against the interface, never a concrete implementation — a Redis
or S3 deployment is a config change, not a code change, and a self-hosted
single-node deployment never needs either.

**2. High Availability is a Postgres-row-based lease, extended, not
reinvented.** Module 10 already introduced `PollerLeaseService` for
seven single-replica-bound background pollers. Module 14 (task #303)
adds leader election on top of the same primitive for cluster-wide
singleton responsibilities (schedule enforcement, cross-node
coordination) rather than introducing a second consensus mechanism
(no Raft/etcd/Zookeeper dependency) — consistent with the "no message
broker for the job system either" precedent Module 10 set for the
Distributed Job System.

**3. Distributed Workers get heartbeat/crash-recovery/priority/
concurrency-limit extensions on the existing `WorkerNode`/
`DistributedJob` tables (task #304), not a new job-runner subsystem.**
A dead worker's claimed jobs are detected via heartbeat staleness and
requeued; per-worker concurrency limits and job priority are additive
columns/query changes to Module 10's claim-based dequeue, not a
replacement of it.

**4. Database support is pooling, replica routing, and migration
validation — not a second ORM layer.** `DATABASE_POOL_MAX`/
`WORKER_DATABASE_POOL_MAX` size Prisma's connection pool per-replica;
an optional read-replica `DATABASE_URL` routes read-only queries when
configured and falls back to the primary when it isn't (task #307).
`apps/api/scripts/validate-migrations.mjs` is a standalone script (no
new dependency) checking `prisma validate` (schema-only, no DB) and,
when a `DATABASE_URL` is available, `prisma migrate diff --exit-code`
against it — drift is reported, not fatal, since this repository's own
migration history has known gaps disclosed since Module 10 (see
`deploy/README.md`'s "Schema setup on first deploy" section).

**5. Backup/DR is file-based and provider-agnostic, matching the storage
abstraction it reuses.** Database dumps (`pg_dump`), attachment/evidence
directories, and config snapshots are written through the same
`StorageService` seam as everything else — a backup lands on local disk
by default and in S3-compatible storage only if `STORAGE_PROVIDER=s3`
is already configured for the deployment. Point-in-time recovery is
documented as a Postgres-operator/managed-service responsibility (task
#312), not re-implemented, consistent with `deploy/README.md`'s existing
disclosure that "Postgres itself is not made highly-available by
anything in this repository."

**6. The Admin Console is a read/action surface over infrastructure the
platform already exposes, not a new source of truth.** `GET
/admin-console/*` (task #314) aggregates `WorkerNode`/`DistributedJob`
state, `CacheService.stats()`, `StorageService` usage, the observability
health/metrics endpoints, and backup/plugin/update state that Modules 14
subsystems already persist — an operations dashboard, not a second
schema.

**7. Tenant management is Enterprise-only and fails closed to
Community.** `TenantController`/`TenantService` (task #315) sit behind
`EditionGuard`, which — per `EditionService.isEnterpriseFor()`'s existing
Module 10 design — treats a deployment with zero `License` rows as a
**trusted, permitted** environment for everything except tenant-specific
billing/branding/custom-domain features, so a self-hosted Community
deployment is never blocked from anything it was already doing; it
simply doesn't see tenant admin as an option.

**8. The API Gateway is opt-in caching plus existing middleware wired
together, not a new reverse-proxy layer.** `@CacheResponse(ttlSeconds)` +
`CacheResponseInterceptor` (task #316) cache GET-only responses through
the existing `CacheService` abstraction, keyed per-user
(`http-cache:<userId|anon>:<path>`) to prevent cross-tenant replay, with
no invalidation on write (a documented TTL-bounded staleness trade-off,
applied only to the one low-churn route it was added to this pass —
`knowledge-base/references`). Rate limiting, compression, and API-key
auth were already real (Module 9/10); this pass's job was composing them
correctly with the new interceptor's guard/interceptor nesting order,
not building them from scratch.

**9. Auto-update is check-and-notify everywhere except the Desktop
Agent, never silent self-replacement.** Per client: the API/worker have
no runtime update concept (deploy-time versioning only, `GET
/observability/health` exposes the running version); the web app polls
`/observability/health` and shows a dismissible banner; the CLI's
`pentesthub update` command prints upgrade instructions rather than
overwriting its own binary; mobile does a store-policy-compliant
check-only comparison; the Desktop Agent's existing Tauri updater (from
Module 7) is the one component with real self-update capability, with a
disclosed no-rollback gap. See `docs/architecture/auto-update.md`.

**10. CI/CD splits PR validation from release/deployment into separate
workflows, and every optional distribution channel is secret-gated.**
`ci.yml` (build/lint/typecheck/test/migration-validation, Turborepo-cached)
runs on every PR; `release.yml` re-verifies at the exact tagged ref
against a fresh ephemeral database (never trusts `main`'s last green run),
generates a CycloneDX SBOM, and creates the GitHub Release; `npm`/`PyPI`
publishing are `if: vars.PUBLISH_*_TO_*` gated so a fork with neither
configured still gets a complete release artifact set.
`docker-publish.yml` adds BuildKit-native SBOM/provenance attestations,
Trivy scanning (informational, matching this codebase's existing `pnpm
audit --audit-level high`/`continue-on-error: true` posture), and cosign
keyless signing via GitHub's own OIDC — no account, key, or paid service
required for any of it. See `docs/architecture/ci-cd.md`.

**11. Performance and Community Edition guarantee passes are dedicated,
not folded silently into feature work.** Task #319 found and fixed one
real N+1 (`GetAvailablePluginUpdatesHandler`, one `findFirst` per
installation → two total queries plus a supporting composite index).
Task #320 audited every Module 14 subsystem against the standing
guarantee and found one real, unrelated bug in the process:
`deploy/k8s/01-configmap.yaml` shipped `QUEUE_PROVIDER: "in-memory"`,
which does not match `env.validation.ts`'s zod enum (`"memory" |
"redis"`) — applying that ConfigMap as shipped would have failed
`validateEnv()` at boot. Both are documented in
`docs/reviews/0006-module-14-performance-review.md` and
`docs/reviews/0007-module-14-community-edition-guarantee.md`.

## Consequences

- Three new pluggable-provider seams (queue/cache/storage) mean every
  future feature that needs background work, caching, or file storage
  must be written against the interface, not `ioredis`/`aws-sdk`
  directly — a constraint, not just a convenience, since bypassing it
  would silently reintroduce a hard Redis/S3 dependency the Community
  Edition guarantee forbids.
- The Admin Console and Tenant Management surfaces both read from
  tables/services other Module 14 subsystems own; neither should grow
  its own persisted state without a specific reason, to avoid two
  sources of truth for the same infrastructure facts.
- CI/CD is now genuinely load-bearing: `release.yml`'s from-scratch
  re-verification at the tagged ref is the first point in this
  project's history where a release build is confirmed independent of
  whatever state `main`'s last CI run happened to be in.
- The Community Edition guarantee, reaffirmed by task #320's dedicated
  audit, is now cross-checked against every subsystem this module
  touched, not just asserted — the one bug that audit found
  (`QUEUE_PROVIDER` typo) is exactly the class of drift that guarantee
  passes exist to catch before it reaches a real deployment.

## Verification constraints (sandbox)

Unlike Modules 7-13, where the standing constraint was "no `pnpm`
binary, no registry network access at all," this pass's sandbox had a
**different and more specific** set of blockers, diagnosed in detail
during task #323:

- `pnpm` is installed but not on `PATH` by default per shell
  invocation — workable once `PATH` is corrected per call.
- Network to `registry.npmjs.org` is not fully blocked but is severely
  degraded (intermittent `UND_ERR_CONNECT_TIMEOUT`, sub-50 KiB/s
  throughput) — a full `pnpm install` cannot complete within this
  sandbox's per-command time budget.
- The `turbo` npm package itself was never fully installed in this
  sandbox — `node_modules/.bin/turbo` is a dangling symlink with no
  `node_modules/turbo` behind it, so `pnpm turbo run ...` cannot execute
  here at all, independent of the network issue.
- Direct `tsc --noEmit` and `prisma validate` invocations hang with zero
  output until the sandbox's own per-call timeout — root-caused to
  filesystem I/O latency on the mounted host folder (confirmed via
  targeted `find`/`readdir` timing tests against the ~1,266-package
  pnpm store), not a defect in the code being checked.
- No Docker daemon/CLI and no `kubectl`/`kubeval`/`kubeconform` are
  available in this sandbox, so Docker image builds and live Kubernetes
  manifest validation could not be executed here either.

What **could** be verified here: structural YAML validation
(`yaml.safe_load_all`) of every new/modified GitHub Actions workflow and
every `deploy/k8s/*.yaml`/`docker-compose*.yml` file — all passed. Full
build/lint/typecheck/test/Docker/Kubernetes verification requires a
normal development machine; see the final report accompanying this
module's completion for the exact commands.
