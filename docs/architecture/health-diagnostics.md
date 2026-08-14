# Health & Diagnostics — Architecture

Module 15, task #353.

## What already existed (Module 10 / Module 14)

`HealthController` (`apps/api/src/modules/observability/controllers/health.controller.ts`)
already implements the standard liveness/readiness split for container
orchestration: `GET /observability/health` (process is up, no DB
dependency) and `GET /observability/health/ready` (a real `SELECT 1`
against Postgres). Module 14's `ClusterOverviewService` already
aggregates deployment-wide infrastructure state (workers, queue, cache,
storage, backups, licensing) for the Admin Console. This task does not
duplicate either — it adds the one thing genuinely missing: a
self-service tool for an *individual user* to check "is it me or is it
them" before filing a support ticket.

## New: `GET /observability/health/diagnostics`

Same `@Public()` controller, same file. Combines a database round-trip
(with its own latency, not just ok/failed) and process metadata into one
response. Always returns `200` — a failed database check is reported
*in* the body as `status: 'degraded'`, not as an HTTP error status,
because the point of this endpoint is to always answer so a report can
be generated even when something else is broken. Public for the same
reason `liveness()` is: a user who can't log in is exactly the person
who most needs this to work without a token.

## Frontend: Settings → Diagnostics

`apps/web/features/system/hooks/use-diagnostics.ts` calls the endpoint
above and pairs the server-reported numbers with what only the browser
can measure: actual round-trip latency (`performance.now()` around the
fetch — the server can only report its own DB latency, not the network
hop to reach it), and basic client environment (user agent, language,
platform, time zone, viewport, online status). This is request-triggered
("run a self-test now"), not a background poller — that job already
belongs to `useAppVersionCheck` (Module 14, stale-build banner) and the
Admin Console.

`apps/web/app/(dashboard)/settings/diagnostics/page.tsx` renders the
result as a small pass/fail grid (server, latency, database, version
sync, network, browser) and a "Copy report" button that formats
everything as plain text — meant to be pasted straight into a support
ticket or chat, setting up naturally for task #355's support flow.

## Known gaps (tracked, not silently dropped)

- **No unauthenticated `/status` page.** The diagnostics *endpoint* is
  public and works for logged-out visitors, but the diagnostics *page*
  lives under the authenticated `(dashboard)/settings` route group, so
  someone who can't log in at all has no in-product page to reach it
  from yet — only the underlying API. A public `/status` page reusing
  the same hook would close this; left for task #355 (Support system)
  to decide whether it belongs there.
- **`apps/desktop` and `apps/mobile` have no diagnostics UI.** Same scope
  pattern as tasks #348–#352 — one real reference implementation (web)
  rather than three shallow ones. Both could call the same public
  endpoint with their own client-info gathering.
- **No historical/trend view.** This is a point-in-time self-test, not a
  monitoring dashboard — Module 14's Prometheus/Grafana stack is the
  right place for trends and alerting, not this page.
- **No jest run to verify behavior in this sandbox** — same standing
  limitation disclosed in tasks #351/#352 (the `jest` package itself is
  absent from the local pnpm store). No new backend unit spec was
  written for this task since `HealthController.diagnostics()` has no
  branching logic worth a dedicated spec beyond what a clean
  `tsc --noEmit` pass and manual read-through already confirm; verified
  by tracing the try/catch against `readiness()`'s existing, already
  battle-tested equivalent.
