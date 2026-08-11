# Module 14 Community Edition Guarantee Review

Scope: verify Module 14's additions (deployment/HA/backup/security/tenant-management/admin-console/API-gateway/auto-update/CI-CD) hold the platform's standing guarantee — no mandatory paid service, self-hosted deployment fully functional, external cloud services always optional. Static review; no live cluster was stood up to test this end-to-end (see the verification-limitations section of `docs/architecture/ci-cd.md` for why).

**Result: guarantee holds. One functional bug found and fixed during this review** (unrelated to the guarantee itself — a config value that would have failed startup validation).

## Findings

**1. Provider selection defaults to free/local everywhere.** `QUEUE_PROVIDER` defaults to `memory`, `CACHE_PROVIDER` to `memory`, `STORAGE_PROVIDER` to `local` (`apps/api/src/config/env.validation.ts`). None require Redis, S3, or any paid service unless explicitly opted into. `REDIS_URL` and every `STORAGE_S3_*` variable are optional with no default.

**2. Edition gating never makes a network call.** `EditionService.isEnterpriseFor()` reads `PENTESTHUB_EDITION` (defaults to `community`) and, at most, a local `License` row count via Prisma — no license-server verification, no external call, ever. A deployment with zero `License` rows is treated as trusted and permitted (not blocked), matching the "self-hosted enterprises are trusted environments" design already documented in `docs/adr/0014-cloud-platform-enterprise-saas-ha.md`.

**3. `docker-compose.yml` is fully self-hosted by default.** Postgres (`pgvector/pgvector`, OSS), plus the platform's own built images. OAuth client IDs default to empty strings (OAuth login simply doesn't appear as an option, rather than failing to boot). `docker-compose.enterprise.yml` is an explicit, separately-invoked overlay — Redis, MinIO (S3-compatible OSS object storage), and an nginx load balancer, all self-hostable — never required for the base deployment.

**4. The Module 14 billing webhook is inert, not required.** `BILLING_WEBHOOK_SECRET` is optional; unset, the endpoint exists but rejects every request with 401 — the rest of the API is entirely unaffected. No specific billing provider (Stripe, Paddle, ...) is hardcoded; a deployment that wants one normalizes that provider's own webhook payload into the generic `BillingWebhookEventDto` shape itself, per that controller's doc comment.

**5. Kubernetes manifests target generic/self-hostable infrastructure.** Ingress annotations are ingress-nginx-specific but explicitly documented as adaptable to Traefik/ALB/GKE Ingress. The TLS certificate manifest uses Let's Encrypt (free) via cert-manager, and is itself optional (`.example` suffix — manual certs work too). Postgres/Redis/MinIO all ship as self-managed StatefulSets, not managed-cloud-service references.

**6. No hardcoded paid-service endpoints found** in `apps/api/src` or `packages/shared/src` (searched for Stripe/Paddle/Auth0/Twilio/Braintree/Chargebee/Recurly and hardcoded AWS/Azure URLs). The one Azure reference found (`cloud-adapters.ts`, Module 10's integrations framework) is a BYOK-style adapter — an org supplies its own Azure DevOps org/PAT — not a platform dependency.

**7. `MTLS_REQUIRED`/`IP_ALLOWLIST` both default off**, and neither requires a paid certificate authority — mTLS is proxy-terminated (self-signed or Let's Encrypt certs both work fine for the client-cert-verification model `MtlsGuard` implements).

## Bug found and fixed during this review

`deploy/k8s/01-configmap.yaml` shipped `QUEUE_PROVIDER: "in-memory"`, but `env.validation.ts`'s zod schema only accepts `"memory" | "redis"` — applying this ConfigMap as shipped would have failed `validateEnv()` at API boot with "Invalid environment configuration." This wasn't a Community Edition guarantee violation (both `"memory"` and `"redis"` are free), just a plain typo/drift bug that would have broken the community deployment path this review was specifically checking. Fixed to `"memory"`.

## Conclusion

Every Module 14 subsystem reviewed defaults to a free, self-hostable configuration, degrades gracefully (rather than failing to boot) when optional paid-adjacent integrations are left unconfigured, and documents the self-hosted alternative alongside every cloud-specific example. The guarantee holds.
