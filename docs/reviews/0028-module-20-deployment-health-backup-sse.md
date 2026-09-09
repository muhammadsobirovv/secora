# Module 20 — Phases 10-14: Deployment, Installer, Health, Backup, Observability, SSE

Deployment/installer/backup/observability were originally built in
Module 14; health endpoints, SSE hardening, and backup-recovery
documentation were hardened further in Module 18. Since then, Modules
16, 17, 19, and 20 added substantial new surface area (SOC/threat-intel/
incidents/remediation modules, a new real-time WebSocket gateway,
billing tables, new migrations). This phase re-audits for drift rather
than rebuilding, per an audit sub-agent's findings.

## Deployment artifacts — real gap, fixed

Module 15/19/20 added Stripe billing (`BILLING_PROVIDER`,
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`)
and a separate enterprise generic-billing-webhook shared secret
(`BILLING_WEBHOOK_SECRET`) to `apps/api/src/config/env.validation.ts`,
but none of them ever made it into `.env.example`,
`deploy/k8s/01-configmap.yaml`/`02-secret.yaml.example`, or
`docker-compose.yml`. All five are `optional()` so nothing breaks at
boot, but an operator following the shipped deployment artifacts to
stand up a paid deployment had no documented place to put Stripe
credentials.

**Fixed**: added the five vars to `docker-compose.yml` (both `api` and
`worker` services — `BillingCoreModule`'s `PAYMENT_PROVIDER` factory,
keyed off `BILLING_PROVIDER`, is a transitive dependency of
`AiBudgetEnforcerService`, which runs in the worker process too, so both
processes need matching config), a new "Billing" section in
`.env.example` with accurate documentation of what each var does and how
`STRIPE_WEBHOOK_SECRET` differs from `BILLING_WEBHOOK_SECRET`,
`BILLING_PROVIDER` added to `deploy/k8s/01-configmap.yaml` (non-secret),
and the four secret values added to `deploy/k8s/02-secret.yaml.example`.

## Installer — real (minor) bug, fixed

`deploy/installer/install.sh` prompted for `--queue`/`--storage`/`--cache`
provider choices when `EDITION=enterprise`, but the captured answers were
never written into `.env`/`.env.enterprise` or passed to `docker compose`
— `docker-compose.enterprise.yml` hardcodes `QUEUE_PROVIDER: redis`,
`CACHE_PROVIDER: redis`, `STORAGE_PROVIDER: s3` directly as literal YAML
values (not `${VAR:-default}` substitutions), so every enterprise
install has always gotten Redis+MinIO regardless of what was typed.
Harmless in practice (the hardcoded values are the sane defaults) but
misleading UX — an operator who typed a different answer would have no
idea it was ignored.

**Fixed**: removed the three dead prompts, replaced with a one-line
informational message. Making the choice actually configurable would
require `docker-compose.enterprise.yml` itself to read those as
substitutable env vars — a real feature addition, not a Module 20 final-
pass fix, so it's left as-is (redis+redis+s3, unconditionally, for
Enterprise Edition) rather than half-wired.

No other installer issues found — `configure.sh`, `backup-wizard.sh`,
`health-check.sh`, `recovery-test.sh`, `rollback.sh`, `upgrade.sh` all
still exist and are not flagged as broken in any prior review.

## Health endpoints — no gap

`apps/api/src/modules/observability/controllers/health.controller.ts`
checks actual infrastructure abstractions (DB via `SELECT 1`, Redis via
`queue.stats()`, S3 via `storage.exists()` — the latter two only when
those providers are actually configured, correctly skipped for
Community Edition defaults) rather than enumerating per-module
dependencies, so nothing added by Modules 16/17/19/20 requires a change
here. Wired into `deploy/k8s/10-api-deployment.yaml`'s readiness/liveness
probes and `apps/api/Dockerfile`'s `HEALTHCHECK`. No changes needed.

## Backup system — no gap

`apps/api/src/modules/backups/backup.service.ts` is schema-agnostic by
design: the DATABASE scope shells a real `pg_dump --format=custom`
against the whole `DATABASE_URL`, and the STORAGE scope walks actual
object-storage keys via `StorageService.list()` — neither enumerates a
per-table/per-model list. Every Prisma model added since Module 14
(SOC, threat-intel, incidents, remediation, billing tables) is
automatically captured without any code change. No changes needed.

## SSE endpoints — no gap

Five `@Sse(...)` endpoints exist repo-wide (agent runs, AI conversation
streaming, recon job logs, vuln scan job logs, the Module 16 real-time
gateway), all behind the global `JwtAuthGuard` and all performing an
explicit ownership/membership check before touching stream data. No
newer SSE endpoint was found in the Module 16/17 SOC/threat-intel/
incidents/remediation/collaboration surfaces — those use the WebSocket
gateway instead, which Module 18 Phase 15's hardening pass already
covers. No changes needed.

## Verification

`docker-compose.yml`, `.env.example`, `deploy/k8s/01-configmap.yaml`,
`deploy/k8s/02-secret.yaml.example`, and `deploy/installer/install.sh`
are configuration/shell files, not TypeScript — verified by manual
review (env var names cross-checked character-for-character against
`env.validation.ts`, and against the same var's usage in every other
deployment artifact for consistency) rather than a compiler pass. No
`apps/api`/`apps/web` TypeScript files were touched in this phase.
