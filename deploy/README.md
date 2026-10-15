# Secora AI — Production Deployment (Module 10)

Four deployment paths, covering the full range from a single machine to a
horizontally-scaled cluster:

| Path | Use when | Entry point |
|---|---|---|
| Docker Compose | Single machine, small team, simplest path to a running stack | `docker-compose.yml` (repo root) |
| Kubernetes | Multi-replica, HA, autoscaling, a real ops team | `deploy/k8s/` |
| Linux (systemd) | Bare-metal/VM without Docker, direct OS-level control | `deploy/linux/` |
| Windows Server | Windows-only infrastructure | `deploy/windows/` |

All four run the exact same application code — the same Docker images (or,
for the Linux/Windows paths, the same `pnpm build` output) — so behavior is
identical regardless of which is chosen; only the process supervision and
scaling model differ.

## Monitoring (Module 14)

`docker-compose.monitoring.yml` is an optional overlay adding Prometheus +
Grafana + Alertmanager, pre-wired to scrape `/observability/metrics` and
load a starter dashboard — see `deploy/prometheus/README.md`. Composes
freely with the base file and the enterprise overlay:

```bash
docker compose -f docker-compose.yml -f docker-compose.monitoring.yml \
  --env-file .env up -d --build
```

For Kubernetes, see that same README for why this repo relies on
`prometheus.io/*` Service annotations plus a cluster's existing
kube-prometheus-stack instead of shipping its own Prometheus manifests.

## Installer suite (Module 14)

`deploy/installer/` wraps the Docker Compose path with the full install/
configure/backup/upgrade/rollback/health-check lifecycle described in
Module 14's spec — see `deploy/installer/README.md`. Quickest start:

```bash
curl -fsSL https://raw.githubusercontent.com/<org>/pentesthub-ai/main/deploy/installer/quick-install.sh | bash
```

## Security (Module 14)

TLS is always terminated in front of the app tier, never inside it — see
`docs/security/tls-mtls-certificates.md` for where, per deployment path
(`deploy/k8s/20-ingress.yaml` + `21-certificate.yaml.example` for
Kubernetes, `deploy/nginx/tls-termination.conf.example` for
Compose/Linux/Windows), how certificate rotation works for each, and how
optional mutual TLS (`MTLS_REQUIRED`) is enforced. `docs/security/secrets-management.md`
inventories every secret this platform uses, how to generate them, and what
rotation actually means for each. `docs/security/waf-compatibility.md` covers
the false-positive traps a generic WAF ruleset hits on this platform's own
traffic (security-payload content in findings/reports, long-lived SSE
streams) if you put one in front. IP allow lists (`IP_ALLOWLIST`) and trusted
reverse-proxy configuration (`TRUST_PROXY_HOPS`) are enforced directly by the
API — see the doc comments on `IpAllowlistGuard` and `TRUST_PROXY_HOPS` in
`env.validation.ts`.

## CI/CD (Module 14)

The container images this deployment guide references (`ghcr.io/<owner>/pentesthub-ai-{api,worker,web}`)
are built, SBOM-attested, vulnerability-scanned, and cosign-signed by
`.github/workflows/docker-publish.yml`. See `docs/architecture/ci-cd.md`
for the full pipeline inventory (PR validation vs. release workflows,
caching strategy, every optional secret/variable, and disclosed gaps) —
nothing in that pipeline requires a paid service to produce a working
build.

## Community vs. Enterprise Edition

Every path above runs Community Edition by default: SQLite is not supported
(see `docs/adr/0014-cloud-platform-enterprise-saas-ha.md` for why —
Postgres+pgvector is the one supported database, and it's free/self-hosted),
but every provider abstraction Module 14 introduces (queue, object storage,
cache) defaults to the zero-external-dependency binding (in-memory queue,
local-disk storage, in-memory cache) — nothing paid is required to run the
full application. `docker-compose.enterprise.yml` is an optional overlay
adding Redis + MinIO + an nginx load balancer for a multi-replica/HA
single-machine setup; `deploy/k8s/13-redis.yaml` and `14-minio.yaml` are the
equivalent opt-in Kubernetes manifests. See
`apps/api/src/modules/infrastructure/edition.service.ts` for how
`PENTESTHUB_EDITION` and the optional `License` table gate Enterprise-only
application features (tenant billing/branding, etc.) — infrastructure choice
and edition are independent: you can run Enterprise Edition on the
Community infrastructure defaults, or Community Edition on the Enterprise
overlay, if that's what your deployment needs.

## Which one should I pick?

- **Just want it running today, on one server?** Docker Compose. `cp
  .env.example .env`, fill in secrets, `docker compose up -d --build`.
- **Need it to survive a node failure, or to autoscale under load?**
  Kubernetes — see `deploy/k8s/README.md`. This is the only path with a
  built-in HorizontalPodAutoscaler and multi-replica rolling updates.
- **No Docker allowed on your infrastructure, Linux hosts?**
  `deploy/linux/install.sh` — installs Node.js, builds the app, and
  registers `pentesthub-api`/`pentesthub-worker` as systemd services.
- **No Docker allowed, Windows hosts?**
  `deploy/windows/install-service.ps1` — same idea, using NSSM to
  register native Windows Services.

## Common prerequisites (all four paths)

- **Postgres 14+ with the `vector` extension** (`CREATE EXTENSION vector;` —
  automatic if using the `pgvector/pgvector` Docker image referenced
  throughout these manifests; must be installed manually on a self-managed
  instance). Required by Module 5's AI/RAG layer.
- **Two secrets, each 32+ characters, generated independently:**
  `JWT_ACCESS_SECRET` and `CREDENTIAL_ENCRYPTION_KEY`. Generate with:
  ```
  node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
  ```
- **Schema setup on first deploy:** this repository's `prisma/migrations`
  directory has migration files for several modules (see
  `apps/api/prisma/migrations`), but not a guaranteed unbroken history —
  some modules' schema changes were authored directly in `schema.prisma`
  during sandboxed development with no live database to run
  `prisma migrate dev` against, so `prisma migrate deploy` (which requires
  every intermediate step to be present) isn't reliable yet. Run
  `pnpm --filter api run prisma:migrate:validate` (Module 14 — see
  `apps/api/scripts/validate-migrations.mjs`) against a real database to
  check the current drift between `schema.prisma` and the migrations
  directory before deciding which apply path to use. Every path above
  documents a `prisma db push` step for first-time setup, which remains
  correct and safe regardless of migration-history state; a team that
  wants a guaranteed-clean migration history from this point forward
  should run `prisma migrate dev --name module_14_baseline` once, locally,
  against a disposable database, commit the resulting migration file, and
  use `prisma migrate deploy` for every deployment after that.

## What's genuinely production-hardened vs. what's a starting point

Real, load-bearing production concerns this Module already implements in
the application itself (not just in these deployment files):

- **High availability**: every `setInterval`-based background poller
  (webhook delivery, workflow runner, scheduled jobs, report schedules,
  compliance enforcement) is safe to run at any replica count via
  `PollerLeaseService` — see
  `apps/api/src/common/concurrency/poller-lease.service.ts`.
- **Graceful shutdown**: `main.ts` calls `app.enableShutdownHooks()`, so
  `SIGTERM` (what Kubernetes/systemd/NSSM all send on a normal stop) runs
  every service's cleanup before the process exits.
- **Health checks**: `/observability/health` (liveness) and
  `/observability/health/ready` (readiness, real DB check) — see
  `apps/api/src/modules/observability/controllers/health.controller.ts`.
- **Metrics**: Prometheus-format `/observability/metrics` and a
  per-organization queue metrics endpoint — see that same directory's
  `metrics.controller.ts`.

What's explicitly a starting point, not a finished HA story:

- **Postgres itself** is not made highly-available by anything in this
  repository — see `deploy/k8s/03-postgres.yaml`'s closing comment. Use a
  managed offering or a Postgres operator for a real production database
  tier.
- **TLS termination** is assumed to happen at the Ingress/reverse-proxy
  layer (nginx Ingress + cert-manager in the Kubernetes path; bring your
  own reverse proxy — nginx, Caddy — in front of the Linux/Windows/Compose
  paths). None of these files run Node.js processes with TLS certificates
  loaded directly.
