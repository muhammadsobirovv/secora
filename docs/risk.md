# Security Risk & Metrics

Module 17. `SecurityMetricsService` computes MTTD (mean time to
detect), MTTR (mean time to remediate), MTTV (mean time to verify),
and SLA compliance rate over a rolling window (`windowDays`, default
30), sourced entirely from existing `Incident`, `RemediationTask`, and
`SlaEvent` rows — no separate metrics-storage table, no background
aggregation job.

## `summary` vs `trend`

- `summary` (used by `docs/soc.md`'s dashboard) returns one snapshot
  for the requested window.
- `trend` (used by the `/executive-security` frontend page, task
  #480) returns the same metric set bucketed by week/month across a
  longer range, for charting.

Both are read-only, computed on request from existing rows — there is
nothing to keep in sync and nothing that can drift from the underlying
incident/remediation/SLA data.

## Endpoints (`RISK_ENDPOINTS`, `SECURITY_METRICS_ENDPOINTS`)

| Purpose | Route |
|---|---|
| Risk summary | `GET risk/summary` |
| Metrics summary | `GET security-metrics/summary` |
| Metrics trend | `GET security-metrics/trend` |

## CLI / SDK

- CLI: `pentesthub risk summary`, `pentesthub metrics summary
  [--window-days N]`
- SDK: `client.risk.summary()`, `client.securityMetrics.*`
  (TypeScript/Python/Go)
