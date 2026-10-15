# Production Deployment Checklist

Module 18 — task #528 (Phase 26). This is the pre-launch readiness
checklist: what to actually confirm/configure before calling a
deployment "production," written from the operator's chair rather than
the module-by-module architecture view. It does not duplicate
`deploy/README.md` (which covers *how* to deploy — Docker Compose vs.
Kubernetes vs. bare-metal, the installer suite, TLS, CI/CD) or the other
`docs/operations/*.md` docs (which each cover one subsystem in depth) —
it cross-references all of them and adds the "did you actually do this"
checklist that ties them together, plus a consolidated list of the
production-relevant gaps this module's audit phases (1-25) already
disclosed, so a deploying team sees them in one place instead of having
to have read every prior `docs/reviews/*.md`.

## 1. Choose a deployment path

See `deploy/README.md`'s comparison table (Docker Compose / Kubernetes /
Linux systemd / Windows Service) — same application code and behavior
regardless of path; only process supervision and scaling differ. This
doc assumes that choice is already made.

## 2. Secrets and configuration

- [ ] `JWT_ACCESS_SECRET` and `CREDENTIAL_ENCRYPTION_KEY` generated
      independently (32+ chars each, see `deploy/README.md`'s generation
      command) — **never reuse one for the other**, and never carry over
      a value from a non-production `.env`.
- [ ] Every required field in `apps/api/.env.example` has a real value —
      `env.validation.ts`'s Zod schema fails boot immediately on a
      missing/invalid required field, so this is largely self-checking,
      but confirm `NODE_ENV=production` explicitly (see §4 below for why
      this specific value matters beyond just being descriptive).
- [ ] `TRUST_PROXY_HOPS` set to the exact hop count of your reverse
      proxy/load balancer chain — every audit-logged IP, the
      `ApiKeyAuthGuard` rate limiter, and `IpAllowlistGuard` all derive
      the client IP from this. Wrong value silently breaks all three.
- [ ] `FRONTEND_URL` and `apps/web`'s `NEXT_PUBLIC_API_URL` point at each
      other's real production origins — Module 18 Phase 21 made this
      load-bearing beyond CORS: `next.config.js`'s CSP `connect-src`
      directive is computed from `NEXT_PUBLIC_API_URL` at frontend build
      time (see that file's doc comments), so a wrong value there
      silently breaks every API call in the browser with a CSP
      violation, not just a CORS error — check the browser console on
      first smoke test, not just network tab status codes.
- [ ] Secrets management approach for the above chosen deliberately (env
      vars via your platform's secret store, not committed anywhere) —
      see `docs/security/secrets-management.md` for the full inventory
      and rotation guidance per secret.

## 3. Database

- [ ] Postgres 14+ with the `vector` extension available
      (`CREATE EXTENSION vector;`).
- [ ] Migration path decided per `deploy/README.md`'s "Schema setup on
      first deploy" section — run
      `pnpm --filter api run prisma:migrate:validate` against the real
      target database first if you intend to use
      `prisma migrate deploy` rather than `prisma db push`.
- [ ] `DATABASE_POOL_MAX` sized as `postgres_max_connections /
      replica_count`, not left at the single-instance default in a
      multi-replica deployment — see `docs/operations/database-migrations.md`.
- [ ] Backup taken and verified restorable **before** first real traffic
      — `deploy/installer/backup-wizard.sh` then
      `deploy/installer/recovery-test.sh` against a scratch database; see
      `docs/operations/backup-recovery.md` for the full backup/restore/
      recovery-testing story, including the disclosed PITR scope
      boundary (WAL archiving is an infrastructure-layer concern this
      application deliberately doesn't bundle).

## 4. Health, readiness, and graceful shutdown

- [ ] Your orchestrator's liveness probe points at
      `/observability/health` and readiness probe at
      `/observability/health/ready` (the latter does a real DB
      connectivity check — see
      `apps/api/src/modules/observability/controllers/health.controller.ts`).
      A load balancer that only checks TCP-open-or-not will route
      traffic to a process that's up but can't reach its database.
- [ ] Your orchestrator sends `SIGTERM` on a normal stop/rolling-update
      (Kubernetes, systemd, and NSSM all do this by default) — `main.ts`
      calls `app.enableShutdownHooks()`, so every service's cleanup runs
      before exit, but only if the platform actually sends `SIGTERM`
      rather than `SIGKILL`ing immediately. Confirm your platform's
      termination grace period is long enough for in-flight requests and
      any open SSE connections to close (30s is a reasonable starting
      point; longer if you expect long-running AI chat streams mid-
      shutdown).
- [ ] `deploy/installer/health-check.sh` (or an equivalent hitting the
      same endpoints) wired into your monitoring/uptime tooling, not
      just used ad hoc during deploys.

## 5. Observability

- [ ] Prometheus scraping `/observability/metrics` — see
      `deploy/prometheus/README.md` for the Compose overlay
      (`docker-compose.monitoring.yml`) or the `prometheus.io/*` Service
      annotation pattern for Kubernetes.
- [ ] Alertmanager actually has a real receiver configured (Slack
      webhook, PagerDuty, email — whatever your team uses) —
      `deploy/prometheus/alertmanager.yml` ships with routing/inhibition
      rules but, per
      `docs/operations/alerting-and-observability.md`'s disclosed gap, no
      receiver is wired by default. **Alerts that fire into nothing are
      worse than no alerting** — this is the single highest-value item
      in this checklist to not skip.
- [ ] Structured JSON logs shipped somewhere queryable (not just
      container stdout scrollback) — see
      `docs/operations/alerting-and-observability.md`'s logging section
      for the `StructuredLoggerService`/`requestIdMiddleware`
      correlation-ID shape every log line carries, which is what makes
      "find every log line for this one failed request" actually
      possible once logs are centralized.
- [ ] `LOG_LEVEL` set appropriately for production volume (verbose debug
      logging in a busy production deployment is its own cost and
      noise problem) — see `env.validation.ts` for the accepted values.

## 6. Security headers and network boundary

- [ ] `apps/web`'s CSP/security headers (Phase 21) are live — confirm
      with a real browser's Network tab against the deployed frontend,
      not just by reading `next.config.js`: `Content-Security-Policy`,
      `Strict-Transport-Security`, `X-Frame-Options`, and the rest
      should all be present on the actual response.
- [ ] TLS terminates in front of the app tier (Ingress + cert-manager for
      Kubernetes, nginx/Caddy for the other three paths) — no path in
      this repository runs Node with certificates loaded directly, so
      skipping this step means the API/web processes serve plain HTTP.
- [ ] `IP_ALLOWLIST` and `MTLS_REQUIRED` configured if your deployment's
      threat model calls for them — both are opt-in/no-op by default,
      which is correct for a typical public-internet-facing deployment
      but worth a deliberate yes/no decision, not a default left
      unexamined.

## 7. Rate limiting and abuse protection

- [ ] Aware of the disclosed single-instance limitation: the global
      `ThrottlerGuard` and `ApiKeyAuthGuard`'s per-key rate limiter (see
      Phase 25's test coverage,
      `docs/reviews/0017-m18-security-critical-test-hardening.md`) both
      keep counters in process memory. In a multi-replica deployment,
      each replica enforces its limit independently — the *effective*
      limit across the whole deployment is (configured limit × replica
      count), not the configured limit. This is a known Module 18 Phase
      10 gap, not something this checklist fixes; if your deployment is
      multi-replica and rate-limit precision matters for your threat
      model, budget for wiring a shared store (Redis, matching
      `RedisCacheService`'s existing pattern) as follow-up work.

## 8. Client surfaces

- [ ] If you distribute the CLI (`packages/cli`) or SDK
      (`packages/sdk-typescript`) to users/integrators, note the
      disclosed gap from Phase 24
      (`docs/reviews/0016-m18-cli-desktop-mobile-sdk-reliability-audit.md`):
      the CLI has no automatic token-refresh path, so a long-lived CLI
      session's access token will eventually expire and require a manual
      `pentesthub login` — expected behavior, not a bug, but worth
      documenting in your own user-facing release notes if you ship the
      CLI externally.
- [ ] Desktop Agent and Mobile app builds point at the correct production
      API base URL (their own `.env`/build-config equivalents) — both
      already have solid offline/retry handling verified in Phase 24, no
      action needed there beyond confirming the URL.

## 9. Smoke test after go-live

- [ ] `deploy/installer/health-check.sh --quiet` (or equivalent) against
      the real deployed URL.
- [ ] One real login (interactive, not just an API key) — this exercises
      the full auth + CSP + CORS + cookie chain in a browser at once.
- [ ] One real recon or vuln job started end-to-end, watching its live
      log stream (SSE) to confirm the reconnect-on-drop behavior
      (Phase 23) and workspace-scoped auth on the stream (Phase 15) are
      both actually reachable through your reverse proxy — an
      idle-timeout on a proxy in front of this deployment is exactly the
      kind of thing that only shows up once real infrastructure is in
      the path, not in local dev.
- [ ] Trigger one intentional alert condition (e.g. temporarily lower a
      threshold, or stop the worker process briefly) to confirm the
      Alertmanager receiver from §5 actually delivers a notification —
      the single most common alerting failure mode is "configured but
      never actually tested end-to-end."

## Known gaps to accept or mitigate before go-live

Consolidated from this module's audit phases, limited to items with
direct production-deployment relevance (the full list, including
gaps with no deployment-time action item, is tracked for Phase 29's
comprehensive documentation pass):

- **Rate-limit counters are per-instance, not shared** (§7 above).
- **No admin/owner endpoint to review a workspace's audit history** —
  `AuditService.listRecentForUser` is self-service-only today (Phase 17,
  reconfirmed in Phase 25). If your compliance posture requires an
  admin-facing audit trail UI, that's unbuilt product work, not a
  configuration toggle.
- **Postgres itself is not made HA by anything in this repository** —
  use a managed offering or a Postgres operator; see `deploy/README.md`.
- **No true PITR** — WAL-archiving is an infrastructure-layer choice
  left to the operator; see `docs/operations/backup-recovery.md`.
- **AI chat / agent orchestration SSE streams do not auto-reconnect on
  drop** (Phase 23, deliberately deferred — see
  `docs/reviews/0015-m18-frontend-reliability-audit.md`) — a dropped
  connection mid-generation requires the user to retry manually. Worth
  knowing before go-live if your reverse proxy has an aggressive idle
  timeout, since that's the most likely trigger.
- **The TypeScript SDK has no automatic refresh-on-401** (Phase 24) —
  relevant if you or your integrators build long-running scripts against
  `@pentesthub/sdk` directly; `SecoraClient.auth.refresh()` must be
  called explicitly.
