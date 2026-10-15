# Secora AI — Monitoring stack (Module 14)

`prometheus.yml` + `alerts.yml` + `alertmanager.yml` here, paired with
`deploy/grafana/` for dashboards, back the optional `docker-compose.monitoring.yml`
overlay (Docker Compose path) — see that file's own header comment for usage.

## Why there's no `deploy/k8s/prometheus.yaml`

Unlike `13-redis.yaml`/`14-minio.yaml`, this directory does not have a
Kubernetes-manifest counterpart deploying Prometheus/Grafana/Alertmanager as
raw `StatefulSet`/`Deployment` resources. Reasoning: Prometheus in
particular is not a "spin up one container" service the way Redis or MinIO
are — real operational use needs persistent-volume-backed TSDB storage,
retention tuning, and (for anything beyond a single node) federation or
remote-write to long-term storage, all of which the
[kube-prometheus-stack Helm chart](https://github.com/prometheus-community/helm-charts)
already does well and is the de facto standard most Kubernetes operators
already run cluster-wide for every workload, not just this one. Rather than
duplicating that (worse, and now something this repo has to maintain),
`deploy/k8s/10-api-deployment.yaml`'s `api` Service carries standard
`prometheus.io/scrape`, `prometheus.io/path`, `prometheus.io/port`
annotations, which kube-prometheus-stack (and most other Prometheus
Kubernetes deployments) auto-discover without any further configuration.

If your cluster doesn't already run a Prometheus, install
kube-prometheus-stack and point it at the `pentesthub` namespace; `alerts.yml`
in this directory can be adapted into a `PrometheusRule` CRD resource for
that stack with minimal changes (the `groups:`/`rules:` structure is
identical).

## Files

- `prometheus.yml` — scrape config (Compose path only; see above for K8s).
- `alerts.yml` — alert rules, referencing only metrics this codebase
  actually emits (see `apps/api/src/modules/observability/metrics-registry.service.ts`).
- `alertmanager.yml` — starter Alertmanager config; no notification channel
  wired by default (see that file's own comment).

See also: `deploy/grafana/` for the paired Grafana dashboard + datasource
provisioning, and `apps/api/src/modules/observability/controllers/health.controller.ts`
for the liveness/readiness/startup endpoints these alerts complement.
