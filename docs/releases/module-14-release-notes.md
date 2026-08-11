# Module 14 Release Notes — Cloud Platform, Enterprise SaaS & High Availability

Full decision record: `docs/adr/0014-cloud-platform-enterprise-saas-ha.md`.
Implementation record: `docs/modules/14-cloud-platform-enterprise-saas-ha.md`.
Dedicated deep-dives: `docs/architecture/{api-gateway,auto-update,ci-cd}.md`,
`docs/reviews/{0006-module-14-performance-review,0007-module-14-community-edition-guarantee}.md`.

## Features added

**Pluggable infrastructure providers** — `QUEUE_PROVIDER`
(memory/Redis), `CACHE_PROVIDER` (memory/Redis/disk), `STORAGE_PROVIDER`
(local disk/S3-compatible), each defaulting to the zero-dependency
binding, each consumed only through an interface
(`apps/api/src/common/providers/`).

**High Availability** — `PollerLeaseService` (Module 10) extended with
`listLeases()` (Admin Console visibility) and proactive lease release on
graceful shutdown, generalized as a reusable distributed-lock/leader-
election primitive rather than a single-purpose poller guard.

**Distributed Workers** — confirmed Module 10's heartbeat/crash-recovery/
priority scheduling already satisfy this module's checklist; added a
canonical job-type-category vocabulary and worker version reporting on
heartbeat.

**Database support** — connection-pool sizing documented against real
replica-count math, optional read-replica routing, and a migration
drift-validation script (`apps/api/scripts/validate-migrations.mjs`) now
wired into CI.

**Backup system & disaster recovery** — real `pg_dump`-based database
backups (optional AES-256-GCM encryption), configuration and storage
backups, checksummed verification, a restore-instructions endpoint, and
an installer-level recovery-test script — all through the same
`StorageService` abstraction as everything else, so backups stay local
by default.

**Security** — mTLS enforcement (`MtlsGuard`, opt-in, `MTLS_REQUIRED`),
IP allow lists, secrets-management/permission-matrix/WAF-compatibility
documentation, TLS termination and rotation documented per deployment
path.

**Admin Console** — one `GET infrastructure/admin/cluster-overview` call
aggregating cluster leases, workers, queue depth, cache/storage/database
dashboards, backups, plugin/update state, and licensing.

**Tenant management (Enterprise-only)** — billing/branding/usage
endpoints on the existing Organizations controller, gated by a new
`EditionGuard` + `@RequiresEdition('enterprise')`, with a licensing
model (`License`, `LicenseEdition`, `LicenseStatus`) that treats an
unlicensed deployment as trusted rather than locked out.

**API Gateway** — opt-in, per-route, GET-only response caching
(`@CacheResponse` + `CacheResponseInterceptor`) over the existing cache
abstraction, user-namespaced keys.

**Auto Update** — a check-and-notify story across every client (web
banner, CLI version/update commands, mobile check-only, Desktop Agent's
existing Tauri updater), deliberately never self-replacing except the
one pre-existing Tauri path.

**CI/CD** — PR-validation vs. release/deployment workflow separation,
Turborepo-aware caching, Docker builds with BuildKit-native SBOM/
provenance, Trivy scanning, cosign keyless signing, a new desktop CI
workflow (Tauri, unsigned, three-OS matrix), release-time CycloneDX SBOM,
secret-gated npm/PyPI publishing, and a new `cargo-audit` job for the
Tauri crate's Rust dependencies.

**Deployment artifacts** — twelve Kubernetes manifests, a full installer
script suite (install/configure/backup/upgrade/rollback/health-check/
recovery-test), Prometheus/Grafana/Alertmanager configs and an optional
monitoring Compose overlay.

**Observability & logging** — health endpoint now reports running
version; new structured JSON logging (`StructuredLoggerService`,
request-ID propagation via `AsyncLocalStorage`) and slow-query logging
on top of Module 10's existing Prometheus/OpenTelemetry stack.

**Performance** — `GetAvailablePluginUpdatesHandler` rewritten from an
N+1 query pattern to two total queries, backed by a new
`@@index([pluginId, publishedAt])` on `PluginVersion`.

## Bugs found and fixed

- **`deploy/k8s/01-configmap.yaml` shipped `QUEUE_PROVIDER: "in-memory"`**,
  which doesn't match `env.validation.ts`'s zod enum (`"memory" |
  "redis"`) — applying that ConfigMap as shipped would have failed
  `validateEnv()` at API boot. Found during the Community Edition
  guarantee audit; fixed to `"memory"`.
- **`GetAvailablePluginUpdatesHandler`'s N+1 query pattern** — flagged in
  a code comment at implementation time, fixed during the dedicated
  Performance review rather than left as a TODO.
- **`ci.yml`'s `PNPM_VERSION` had drifted to `"9"`** against root
  `package.json`'s declared `packageManager: "pnpm@11.10.0"` — a
  previously-undetected CI-correctness bug, fixed by pinning to the
  declared version everywhere it's referenced.

## Known limitations

- **`packages/cli` has no jest infrastructure** — no test script, no
  jest devDependency. Scoped out of this module's Tests pass (would
  require net-new config from scratch with no existing pattern to
  follow) rather than silently dropped; disclosed in
  `docs/architecture/ci-cd.md`'s "Known gaps" section.
- **`desktop-ci.yml` and `mobile-ci.yml` are unverified in this
  sandbox** — no Rust toolchain, no Flutter SDK, no Windows/macOS
  runners available here; both are written against documented, standard
  tool conventions and disclosed as such in their own header comments.
- **iOS release signing (Fastlane match) and Tauri updater/installer
  signing remain open gaps**, surfaced but not closed this module.
- **Point-in-time recovery is a documented Postgres-operator/managed-
  service responsibility**, not implemented in this repository — matches
  the standing disclosure that Postgres itself is not made highly
  available by anything shipped here.

## Testing

New Jest spec files this module: `apps/api/src/common/guards/mtls.guard.spec.ts`
(4 tests — first guard spec in this codebase), `apps/api/src/common/interceptors/cache-response.interceptor.spec.ts`
(5 tests — first interceptor spec), `apps/api/src/modules/plugins/queries/plugin-installations.query.spec.ts`
(5 tests, verifying the N+1 fix's core property: `pluginVersion.findMany`
called exactly once regardless of installation count). All three
hand-roll their Prisma/dependency mocks, matching this codebase's
established testing convention.

## Verification

**What ran successfully in this sandbox:** structural YAML validation
(`python3 -c "import yaml; yaml.safe_load_all(...)"`) of every new/
modified GitHub Actions workflow (5 files) and every `deploy/k8s/*.yaml`/
`docker-compose*.yml` file (9 files) — all passed.

**What could not run in this sandbox, and why:**

| Command | Failure | Cause |
|---|---|---|
| `pnpm turbo run build lint check-types test --force` | `Cannot find module '.../node_modules/turbo/bin/turbo'` | The `turbo` npm package was never fully installed here — only a dangling `.bin/turbo` symlink exists. Environment limitation, not a code defect. |
| `pnpm install` (fresh, monorepo-wide) | Times out (`UND_ERR_CONNECT_TIMEOUT`, sub-50 KiB/s) | Network to `registry.npmjs.org` is present but severely degraded in this sandbox — not fully blocked, just too slow to complete within the per-command time budget. |
| `node_modules/.bin/tsc --noEmit` (apps/api) | Hangs, zero output, times out at ~170s | Filesystem I/O latency on the mounted host folder — confirmed via timing tests (`find node_modules -type f`: 7.3s for 4,268 files; `find node_modules/.pnpm -maxdepth 1`: 3.9s for 1,266 dirs). Any tool doing heavy module-resolution traversal exceeds the sandbox's per-call cap. Environment limitation. |
| `node_modules/.bin/prisma validate` | Same symptom as `tsc` | Same root cause — confirmed as a control case, not tsc-specific. |
| `docker build ...` | `docker: command not found` | No Docker daemon/CLI in this sandbox. |
| `kubectl apply --dry-run` / `kubeval` / `kubeconform` | Not available | No Kubernetes tooling installed in this sandbox. |

**Exact commands to run on a normal development machine** (with `pnpm`,
full network access, Docker, and `kubectl` available) to complete
verification before merging:

```bash
pnpm install
pnpm --filter shared build
pnpm --filter api run prisma:migrate:validate   # against a real Postgres instance
pnpm turbo run build lint check-types test --force
docker build -f apps/api/Dockerfile .
docker build -f apps/worker/Dockerfile .          # if a separate worker Dockerfile exists
docker build -f apps/web/Dockerfile .
kubectl apply --dry-run=client -f deploy/k8s/
# Optional, if the Flutter SDK / Rust toolchain are available:
flutter test && flutter build apk --debug         # apps/mobile
cd apps/desktop/src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

No git commit has been made for Module 14's work as of this report,
consistent with this module's standing instruction not to commit until
build/lint/typecheck/test have been successfully verified — see the
accompanying final report for the full disclosure and recommended next
step.
