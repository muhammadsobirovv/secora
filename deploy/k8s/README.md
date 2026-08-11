# PentestHub AI — Kubernetes deployment

Reference manifests for a multi-replica, horizontally-scaled deployment. For a
single-machine deployment, use the root `docker-compose.yml` instead — see
its own header comment for the tradeoffs.

## Prerequisites

- A Kubernetes cluster (1.27+) with an Ingress controller installed (nginx by default — see `20-ingress.yaml`).
- A container registry the cluster can pull from — these manifests reference `ghcr.io/pentesthub-ai/pentesthub-ai-{api,worker,web}`, the images `.github/workflows/docker-publish.yml` builds.
- Either a managed Postgres instance, or apply `03-postgres.yaml`'s self-managed StatefulSet (see that file's closing comment for why a managed instance is preferred).

## Apply order

```bash
kubectl apply -f deploy/k8s/00-namespace.yaml
kubectl apply -f deploy/k8s/01-configmap.yaml

# Create the real Secret — see 02-secret.yaml.example's comment for the
# recommended way to do this without writing plaintext secrets to disk.
kubectl create secret generic pentesthub-secrets -n pentesthub \
  --from-literal=DATABASE_URL='...' \
  --from-literal=JWT_ACCESS_SECRET="$(node -e 'console.log(require("crypto").randomBytes(48).toString("base64"))')" \
  --from-literal=CREDENTIAL_ENCRYPTION_KEY="$(node -e 'console.log(require("crypto").randomBytes(48).toString("base64"))')"

# Only if using the self-managed Postgres StatefulSet:
kubectl apply -f deploy/k8s/03-postgres.yaml

kubectl apply -f deploy/k8s/10-api-deployment.yaml
kubectl apply -f deploy/k8s/11-worker-deployment.yaml
kubectl apply -f deploy/k8s/12-web-deployment.yaml
kubectl apply -f deploy/k8s/20-ingress.yaml
```

Or, once the real Secret exists: `kubectl apply -f deploy/k8s/` applies everything else in the correct order (filenames are numbered for this).

### Optional: Module 14 multi-replica providers

`13-redis.yaml` and `14-minio.yaml` are opt-in — only needed once `01-configmap.yaml`'s
`QUEUE_PROVIDER`/`CACHE_PROVIDER`/`STORAGE_PROVIDER` are switched from their
Community Edition defaults (`in-memory`/`memory`/`local`) to `redis`/`redis`/`s3`,
which becomes necessary once the api/worker Deployments run more than one
replica each (the in-memory and local-disk providers aren't shared across pods —
see that ConfigMap's comment). Apply them, fill in the corresponding
`REDIS_PASSWORD`/`REDIS_URL`/`STORAGE_S3_*` keys in the real Secret (see
`02-secret.yaml.example`), then flip the ConfigMap values and roll the
Deployments:

```bash
kubectl apply -f deploy/k8s/13-redis.yaml
kubectl apply -f deploy/k8s/14-minio.yaml
kubectl rollout restart deployment/api deployment/worker -n pentesthub
```

## First-time schema setup

This schema does not have a guaranteed-unbroken `prisma migrate` history
(see `apps/api/prisma/migrations`' own contents, `ci.yml`'s test job comment,
and `pnpm --filter api run prisma:migrate:validate` — Module 14 — for how to
check current drift against a real database) — run a one-off `db push`
against the target database before traffic hits the api Deployment for the
first time:

```bash
kubectl run pentesthub-schema-init --rm -it --restart=Never -n pentesthub \
  --image=ghcr.io/pentesthub-ai/pentesthub-ai-api:latest \
  --overrides='{"spec":{"containers":[{"name":"pentesthub-schema-init","image":"ghcr.io/pentesthub-ai/pentesthub-ai-api:latest","command":["npx","prisma","db","push","--skip-generate"],"envFrom":[{"secretRef":{"name":"pentesthub-secrets"}}]}]}}'
```

A production deployment that has since generated a real migration history should
use `prisma migrate deploy` here instead — see `docs/adr/0010-enterprise-platform.md`'s
Production Readiness section.

## Rolling updates

```bash
kubectl set image deployment/api api=ghcr.io/pentesthub-ai/pentesthub-ai-api:v1.2.3 -n pentesthub
kubectl rollout status deployment/api -n pentesthub
```

`maxUnavailable: 0` (see `10-api-deployment.yaml`) means the rollout never drops
below full replica capacity — combined with the readiness probe hitting
`/observability/health/ready` (a real `SELECT 1` against Postgres, not just
"process is up"), a new replica that can't reach the database never receives
traffic, and the old replicas keep serving until it can.

## What's genuinely HA here vs. not

See `03-postgres.yaml`'s closing comment — the API/worker/web tiers are all
horizontally scaled and safe to run at any replica count (per
`PollerLeaseService`, `apps/api/src/common/concurrency/poller-lease.service.ts`),
but the self-managed Postgres StatefulSet in this manifest set is a single
point of failure unless replaced with a managed HA offering or an operator
like CloudNativePG.
