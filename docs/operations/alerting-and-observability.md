# Alerting & Operational Signals

Module 18 — task #521 (Phase 19: alerting/operational signals documentation). This
is the one place an operator should need to read to answer "how do I know
Secora AI is unhealthy, and what do I check first." It documents what
already exists and is wired up today — no new alert rules, endpoints, or
metrics were added to write this doc; it consolidates and cross-references
real, existing pieces built across Modules 10, 14, and 18.

## 1. Health, readiness, and liveness endpoints

`HealthController` (`apps/api/src/modules/observability/controllers/health.controller.ts`,
Module 10, extended by Module 18 task #507) is registered under both
`/health` and `/observability/health` and exposes:

- `GET /health` and `GET /health/live` — liveness. Never touches the
  database; answers "is the process up at all." An orchestrator should
  restart the pod/container only when this fails.
- `GET /health/ready` — readiness. Always runs a real `SELECT 1` against
  Postgres. Additionally checks the queue and object storage backends, but
  only when the deployment has opted into a network-backed provider
  (`QUEUE_PROVIDER=redis`, `STORAGE_PROVIDER=s3`) — the in-process
  Community Edition defaults are skipped as a check because they can't fail
  independently of the process itself. Returns HTTP 503 with a
  `{status, checks}` body when any checked dependency fails; a load
  balancer or Kubernetes readiness probe should stop routing traffic on a
  503 here.
- `GET /health/version` — build/version metadata (`version`, `environment`,
  `gitCommit`, `buildTimestamp`). `gitCommit`/`buildTimestamp` are `null`
  today because no CI workflow currently injects `GIT_COMMIT`/
  `BUILD_TIMESTAMP` env vars at build time — this is not a bug, just an
  unpopulated optional field; set those two env vars in your build
  pipeline if you want them.
- `GET /health/diagnostics` — a combined self-test (database round-trip
  latency + process metadata) that always returns HTTP 200, reporting
  degradation in the response body rather than as an HTTP error, so it
  remains usable as a diagnostic even when something else is broken.

All four routes are `@Public()` — reachable without authentication, by
design, since an unauthenticated caller (a load balancer, an orchestrator,
or a user hitting a frontend diagnostics widget) is exactly who needs them
most.

## 2. Metrics endpoint

`GET /observability/metrics` (`MetricsController`, backed by
`MetricsRegistryService` — `apps/api/src/modules/observability/metrics-registry.service.ts`,
Module 10, extended by Module 18 task #520) serves Prometheus text-exposition
format. It currently exposes:

- `pentesthub_process_uptime_seconds`, `pentesthub_process_resident_memory_bytes`,
  `pentesthub_process_heap_used_bytes`, `pentesthub_process_heap_total_bytes` —
  process gauges, computed fresh on every scrape.
- `pentesthub_http_requests_total` / `pentesthub_http_request_duration_seconds` —
  every HTTP request, labeled by route pattern (not raw URL) and status.
- `pentesthub_webhook_deliveries_total`, `pentesthub_workflow_runs_total`,
  `pentesthub_mcp_tool_invocations_total` /
  `pentesthub_mcp_tool_invocation_duration_seconds`, `pentesthub_agent_sdk_runs_total`,
  `pentesthub_script_executions_total`, `pentesthub_relay_commands_total`,
  `pentesthub_evaluation_runs_total` — per-surface counters/histograms
  covering the automation and AI Agent SDK surfaces added in Modules 11–13.

Separately, `apps/api/src/modules/distributed-jobs` exposes a
per-organization queue-metrics endpoint (`pentesthub_distributed_jobs_*`
series) gated behind `OBSERVABILITY_METRICS_TOKEN`. It is not scraped by
the default `scrape_configs` in `deploy/prometheus/` because it's
per-organization rather than per-instance — add one scrape job per
organization you want alerting on, or use the Admin Console's Cluster
Overview page for an aggregate view instead.

## 3. Alert rules (`deploy/prometheus/alerts.yml`)

Every rule below references a metric that actually exists per section 2
above — this file is deliberately small rather than a "best practice"
superset referencing metrics this codebase doesn't emit.

**`pentesthub-api` group:**

| Alert | Condition | For | Severity | What it means |
|---|---|---|---|---|
| `SecoraHighErrorRate` | 5xx ratio of `pentesthub_http_requests_total` > 5% | 5m | warning | A meaningful share of requests are failing. Check the API logs (see section 4) for the failing route, filtering by `route` label from the request logs around the alert's firing window. |
| `SecoraHighRequestLatency` | p95 of `pentesthub_http_request_duration_seconds` > 2s for a route | 10m | warning | A specific route is slow. `{{ $labels.route }}` in the alert identifies which one. |
| `SecoraProcessMemoryHigh` | `pentesthub_process_resident_memory_bytes` > 1.5GB | 15m | warning | Possible memory leak, or the container's memory limit/request in `deploy/k8s/10-api-deployment.yaml` is undersized for real traffic. |
| `SecoraAPIDown` | `up{job="pentesthub-api"} == 0` | 2m | critical | Prometheus can't scrape the instance at all — likely a crash or network partition, not a graceful degradation. |

**`pentesthub-distributed-jobs` group** (only fires for organizations whose
per-org metrics endpoint is actually scraped — see section 2):

| Alert | Condition | For | Severity | What it means |
|---|---|---|---|---|
| `SecoraNoOnlineWorkers` | `pentesthub_distributed_jobs_online_workers == 0` | 5m | critical | Queued jobs for that organization will not be processed until a worker re-registers or an unhealthy one recovers via `WorkerReaperService`'s crash-recovery path. |
| `SecoraQueueBacklogGrowing` | load/capacity ratio > 0.9 | 15m | warning | Worker pool near capacity — consider registering additional WorkerNodes or raising `maxConcurrency`. |

## 4. Structured logging and request correlation

`StructuredLoggerService` (`apps/api/src/observability/structured-logger.service.ts`,
Module 18 task #506) replaces Nest's default logger app-wide, emitting one
JSON object per line (`LOG_FORMAT=json`, the default) or a single-line
human-readable format for local development (`LOG_FORMAT=pretty`). Every
line includes `service` (`'api'` or `'worker'` — the two OS processes share
one database and can interleave in a shared log aggregator), `environment`
(`NODE_ENV`), and — when the line was emitted inside a request — the
request's correlation id.

`requestIdMiddleware` (`apps/api/src/observability/request-id.middleware.ts`,
Module 18 task #505) assigns or propagates an `X-Request-Id` header on
every request: it honors an incoming `X-Request-Id` (up to 128 characters)
from an upstream proxy/gateway, generates a UUID otherwise, echoes it back
in the response header, and wraps the rest of the request in
`requestContextStorage.run(...)` (AsyncLocalStorage) so every log line the
request produces — including ones emitted deep in a service or repository,
with no explicit parameter threading — carries the same id via
`getRequestId()`. To trace a single failing request end-to-end: take the
`X-Request-Id` from the client's response headers (or from the failing
request in browser devtools/API client logs) and grep the API/worker logs
for that id.

`LOG_LEVEL` (`env.validation.ts`) filters what's emitted (`fatal` through
`trace`, mapped onto Nest's `LogLevel` vocabulary internally). Sensitive
fields are redacted before serialization by `redactSensitiveData()`
(`apps/api/src/observability/log-redaction.util.ts`, Module 18 task #506).

## 5. Alertmanager routing (`deploy/prometheus/alertmanager.yml`)

Alerts are grouped by `alertname` and `organizationId` (`group_by`), with a
30s `group_wait`, 5m `group_interval`, and a 4h default `repeat_interval` —
tightened to 1h for `severity: critical` alerts via a sub-route. An
`inhibit_rules` block suppresses `SecoraHigh.*` (error rate, latency)
alerts for an instance while `SecoraAPIDown` is already firing for that
same instance, so a full outage doesn't also page for "high error rate" on
a target that's simply gone.

**Known gap, disclosed rather than silently left implicit:** the shipped
config has a single `default` receiver with no notification channel wired
— the webhook/PagerDuty/Slack receiver block is present only as a
commented-out example. An operator deploying this must configure a real
receiver (webhook URL, PagerDuty integration key, Slack webhook, etc.)
before alerts actually notify anyone; Prometheus firing an alert with no
receiver configured is a silent no-op from the operator's perspective.

## 6. Known observability gaps (disclosed, not fixed in this phase)

Consolidated here so there is one place to see current limitations, rather
than scattered across individual module doc comments. None of these was
assessed as safely fixable within this sandboxed, non-test-executable
environment without risking an unverified regression; each is a concrete
feature addition, not a bug fix.

- **Health checks aren't exposed as Prometheus gauges.** `/health/ready`'s
  database/queue/storage checks (section 1) have no `up{component="..."}`
  equivalent in the `/observability/metrics` output today, so Alertmanager
  can't page on a dependency outage via the metrics pipeline — only an
  external orchestrator's own probe tooling hitting `/health/ready`
  directly detects it. A clean fix means extracting `HealthController`'s
  inline check logic into a shared method both controllers call, and
  making the metrics render path async to accommodate the real round-trip.
- **Metrics, logs, and traces are three disjoint systems.** No exemplars
  on histograms, no trace-id-as-metric-label, and `withSpan()`
  (`apps/api/src/observability/tracing.ts`) is only wired into two of the
  roughly seven surfaces `MetricsRegistryService` instruments (workflow
  execution, webhook delivery) — correlating "this slow request" across
  all three signal types requires manual cross-referencing by timestamp
  today, not a single click-through.
- **No reusable Gauge primitive.** `MetricsRegistryService` only has
  `Counter`/`Histogram` classes; the process gauges in section 2 are
  hand-built text rather than registered typed `Gauge` instances.
- **`RealtimeHubService`'s per-workspace stream map never evicts entries**
  (bounded by workspace count, not connection count) — see that service's
  class doc comment. A correct fix needs an RxJS `Subject.observed`-based
  refcount.
- **Recon/vuln job-log SSE streams (`GET .../stream`) send no heartbeat
  during quiet polling intervals**, so a client behind an idle-timing
  intermediary proxy can silently drop the connection without either side
  noticing until the next log line. A safe fix needs bypassing `@Sse()`'s
  `data:`-only serialization to emit comment-frame heartbeats — see the
  doc comments on `recon-jobs.controller.ts`'s and
  `vuln-scan-jobs.controller.ts`'s `streamLogs()` methods for the traced
  frontend-parser compatibility constraint that makes this non-trivial.
- **`AuditEvent` has no tamper-evidence (hash-chain) field.** The table is
  genuinely append-only (verified — no update/delete call sites exist
  anywhere in `apps/api/src`), but nothing would currently detect a direct
  database-level row deletion or edit performed outside the application.
  Adding one needs a schema migration, a backfill for existing rows, and a
  verification job — none of which is safely, fully verifiable in this
  sandbox.
- **No admin/workspace-wide audit-query endpoint exists.**
  `AuditService.listRecentForUser()` is the only audit-read path in the
  codebase, and it is scoped to the calling user's own events (used by the
  GDPR data-export flow) — there is no route for a workspace admin/owner
  to review that workspace's full audit history. This is a missing
  feature, not an access-control bug in the code that exists today.
- **The orphaned `SECRET_ROTATED` `AuditEventType` enum value** (added in
  Module 9) has no call site anywhere in the codebase — kept rather than
  removed, since removing an enum value is a breaking schema change and
  the original intended call site can't be reconstructed with confidence.

These are also tracked in `docs/releases/` (Module 18 release notes,
written in Phase 29) alongside every other gap disclosed across this
module's audit phases.

## 7. BLOCKED BY ENVIRONMENT

None of the content in this document required executing the application,
so nothing here is blocked by the sandbox. (Contrast with
`docs/operations/database-migrations.md`'s Phase 7 verification loop,
which genuinely could not run `prisma migrate deploy` against a live
database in this environment.) The one item worth flagging explicitly:
none of the alert thresholds above (5% error rate, 2s p95 latency, 1.5GB
RSS, 90% queue capacity) have been validated against real production
traffic in this sandbox — they are reasonable starting points, not
empirically tuned values. Revisit them once real traffic/usage data exists.
