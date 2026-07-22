# PentestHub AI — Production Deployment (Module 10)

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
  directory only has migration files through Module 5 — Modules 6-10's
  schema changes were authored directly in `schema.prisma` during
  sandboxed development with no live database to run `prisma migrate dev`
  against (see `apps/api/prisma/migrations`). Every path above documents a
  `prisma db push` step for first-time setup; a team that wants a real
  migration history from this point forward should run
  `prisma migrate dev --name module_10_baseline` once, locally, against a
  disposable database, commit the resulting migration file, and use
  `prisma migrate deploy` for every deployment after that.

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
