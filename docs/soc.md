# Security Operations Center (SOC)

Module 17. The SOC dashboard (`GET /soc/dashboard`, `SOC_ENDPOINTS.dashboard`)
is a thin, read-only composition over four already-existing services — it
introduces no new data source and no new "what counts as X" logic of its
own:

| Field | Sourced from |
|---|---|
| `openIncidentsCount` / `criticalOpenIncidentsCount` | `IncidentsService.listForWorkspace` (status in `OPEN/INVESTIGATING/CONTAINMENT/ERADICATION/RECOVERY/REOPENED`) |
| `recentIncidents` | `IncidentsService.listForWorkspace` (10 most recent) |
| `breachedSlaEventsCount` / `recentBreachedSlaEvents` | `SlaService.listEventsForWorkspace({ breachedOnly: true })` |
| `activeIndicatorsCount` | `IndicatorsService.listForWorkspace({ status: 'ACTIVE' })` |
| `metrics` | `SecurityMetricsService.summary` (MTTD/MTTR/MTTV/SLA compliance over `windowDays`, default 30) — `null` if the underlying computation fails, never blocks the rest of the dashboard |

All four calls run in parallel (`Promise.all`), and every one is bounded
(each list capped at 200 rows) — see [`docs/threat-intelligence.md`](./threat-intelligence.md#performance)
and the sibling docs below for what each underlying service actually
guarantees.

## Authorization

`SocController.resolveWorkspaceId` always derives the workspace from the
authenticated caller's own personal workspace
(`WorkspacesRepository.findPersonalWorkspaceForUser`) — there is no
query parameter, body field, or header a client can set to view another
workspace's dashboard. A caller with no personal workspace gets
`WORKSPACE_NOT_FOUND` (404), never a fallback to any other workspace's
data. Covered by `soc.controller.spec.ts` (task #496).

## Known bound

A workspace with genuinely more than 200 open incidents, breached SLA
events, or active indicators in one query window will under-count on
this dashboard (the same 200-row cap every other Module 17 list
endpoint uses) — this is a disclosed limit, not a silent bug. Use the
underlying `/incidents`, `/sla/events`, and `/intel/indicators` list
endpoints directly (with pagination) for an exhaustive view.

## Executive Security dashboard

A sibling `/executive-security` frontend page (task #480) reads the
same `SecurityMetricsService.summary`/`trend` endpoints
(`SECURITY_METRICS_ENDPOINTS`) directly, without going through
`/soc/dashboard` — it needs the trend series (`GET
security-metrics/trend`) this composed endpoint doesn't expose.

## CLI / SDK

- CLI: `pentesthub soc dashboard [--window-days N]`
- SDK: `client.soc.dashboard({ windowDays })` (TypeScript/Python/Go, all
  three added in task #491)
