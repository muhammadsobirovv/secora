# TLS, Mutual TLS, and Certificate Rotation

Module 14 reference for how encryption-in-transit is configured across every
deployment path. The short version, stated once so nothing below is a
surprise: **no Node.js process in this repository (`apps/api`, `apps/web`,
the worker) ever loads a TLS certificate or private key directly.** TLS is
always terminated by a dedicated reverse proxy or load balancer in front of
the app tier. This is a deliberate architectural boundary, not a gap —
running the app process and the TLS private key in the same process is a
larger blast radius for no real benefit over a dedicated, purpose-built proxy.

## Where TLS terminates, per deployment path

| Deployment path | TLS termination point | Config |
|---|---|---|
| Kubernetes | nginx Ingress controller (or your cluster's ingress-nginx/Traefik/ALB equivalent) | `deploy/k8s/20-ingress.yaml` |
| Docker Compose / Linux systemd / Windows service | A reverse proxy you put in front (nginx, Caddy, or a cloud load balancer) | `deploy/nginx/tls-termination.conf.example` |
| Docker Compose Enterprise (`docker-compose.enterprise.yml`) | Same as above — the bundled `lb` service (`deploy/nginx/lb.conf`) load-balances across scaled `api` replicas *behind* whatever terminates public TLS, it does not terminate TLS itself | `deploy/nginx/lb.conf` + `deploy/nginx/tls-termination.conf.example` composed together |

Every internal hop after TLS termination (proxy → api, api → Postgres/Redis/
MinIO) is plain TCP on a private network (a Docker Compose network, a
Kubernetes namespace's internal DNS, or a VPC) — encrypting those hops too is
an infrastructure-level choice (e.g. a service mesh, or Postgres's own
`sslmode` if the database is reached over a network you don't otherwise
trust) that's outside what this application configures for you.

## Getting a certificate

- **Kubernetes**: `deploy/k8s/21-certificate.yaml.example` — a cert-manager
  `ClusterIssuer` (production and staging Let's Encrypt variants) that, once
  applied and referenced from `20-ingress.yaml`'s `cert-manager.io/cluster-issuer`
  annotation, has cert-manager request, install, and continuously renew the
  certificate stored in the `pentesthub-tls` Secret automatically. Requires
  cert-manager's CRDs to already be installed in the cluster — see that
  file's header comment for the install command. This is genuinely "just
  works" automation, not a documented-but-manual step.
- **Docker Compose / Linux / Windows**: `deploy/nginx/tls-termination.conf.example`
  is written to be filled in by `certbot --nginx -d app.your-domain.example -d
  api.your-domain.example`, which rewrites the `listen`/`ssl_certificate`
  lines and installs a renewal timer (systemd timer on most distros, or a
  Task Scheduler equivalent if you're running nginx on Windows via WSL/a
  container). A self-managed CA-issued certificate (internal PKI, an
  enterprise's existing wildcard cert) works the same way — just point
  `ssl_certificate`/`ssl_certificate_key` at those files instead and manage
  renewal through whatever process already handles your organization's other
  internal certificates.

## Certificate rotation

"Rotation" here means routine renewal before expiry, not a security-incident
response (see [`secrets-management.md`](./secrets-management.md) for
compromised-credential rotation, which is a different, faster-turnaround
process).

- **Kubernetes with cert-manager**: fully automatic. cert-manager tracks each
  Certificate's expiry and renews it well before the ~90-day Let's Encrypt
  window closes, updating the `Secret` in place. ingress-nginx watches that
  Secret and picks up the new certificate with no pod restart. There is
  nothing to schedule or remember — this is the recommended path specifically
  because rotation stops being an operator task at all.
- **Everything else, via certbot**: certbot installs a renewal timer/cron
  entry during `certbot --nginx`. Verify it's actually active
  (`systemctl list-timers | grep certbot` on most distros, or `certbot
  renew --dry-run` to confirm the renewal command itself still works) —
  this is the step most likely to silently rot: the timer can exist but
  fail silently for months (DNS changed, port 80 got closed for the HTTP-01
  challenge, etc.) until the certificate actually expires and every
  browser starts showing a warning. Put `certbot renew --dry-run` (or your
  CA's equivalent) into whatever monitoring already runs
  `deploy/installer/health-check.sh`, so a broken renewal path surfaces
  weeks before expiry rather than the day of.
- **A manually-issued/internal-CA certificate**: no automated rotation exists
  in this repo by definition — track the expiry date wherever your
  organization already tracks other internal certificate expiries, and treat
  a nginx config reload (`nginx -s reload`, zero-downtime) as the deployment
  step once the new cert/key files are in place.

## Mutual TLS (mTLS)

Mutual TLS — the server also verifying a client-presented certificate, not
just the client verifying the server's — is opt-in and, like server-side TLS,
happens at the proxy layer:

- `MTLS_REQUIRED` (default `false`) and `MTLS_CLIENT_CERT_VERIFY_HEADER`
  (default `X-Client-Cert-Verify`) in `apps/api/src/config/env.validation.ts`
  control the *application-side* check only.
  `apps/api/src/common/guards/mtls.guard.ts` (registered globally in
  `app.module.ts`, immediately after `IpAllowlistGuard`) is a no-op when
  `MTLS_REQUIRED` is false. When true, it rejects any request that doesn't
  carry a non-empty value in the configured header, with `403
  MTLS_CLIENT_CERT_NOT_VERIFIED`.
- The guard **does not perform the TLS handshake or verify a certificate
  itself** — it cannot, since the Node process never sees the raw TLS
  connection. It trusts that the proxy in front of it already did real client
  certificate verification and only forwards traffic that passed, setting the
  configured header as proof. This means `MTLS_REQUIRED=true` is only as
  secure as the proxy configuration actually enforcing verification — see the
  two proxy-side configs below. **Enabling `MTLS_REQUIRED` without also
  configuring the proxy to verify client certificates and set the header is a
  false sense of security**: any client could just send the header itself
  unless the proxy strips inbound copies of it before setting its own (both
  example configs below set the header only after nginx's own verification,
  which naturally overwrites anything a client sent — but if you swap in a
  different proxy, replicate that "verify first, then set the header
  yourself" behavior explicitly).
- **nginx** (`deploy/nginx/tls-termination.conf.example`): uncomment
  `ssl_client_certificate` (pointed at your trusted client-CA bundle) and
  `ssl_verify_client optional`, then uncomment the
  `proxy_set_header X-Client-Cert-Verify $ssl_client_verify;` line. `optional`
  (not `on`) lets you enforce the requirement at the application layer via
  `MTLS_REQUIRED` on specific deployments while leaving the proxy able to
  serve non-mTLS traffic too, if useful; use `on` instead if every request to
  this proxy must present a client cert with no exceptions.
- **Kubernetes/ingress-nginx** (`deploy/k8s/20-ingress.yaml`): the commented
  `nginx.ingress.kubernetes.io/auth-tls-secret` /
  `auth-tls-verify-client` / `auth-tls-pass-certificate-to-upstream`
  annotations are ingress-nginx's mTLS support. ingress-nginx does not set
  `X-Client-Cert-Verify` itself in the exact shape `mtls.guard.ts` expects —
  either add an nginx `configuration-snippet` annotation that sets it from
  `$ssl_client_verify` (mirroring the plain-nginx config above), or change
  `MTLS_CLIENT_CERT_VERIFY_HEADER` to whatever header your specific ingress
  controller version actually forwards (check its docs; this varies more
  across ingress controllers than the plain-nginx case does).

## WAF compatibility

See [`waf-compatibility.md`](./waf-compatibility.md) for how a Web Application
Firewall sitting in front of (or as part of) the TLS-terminating layer
interacts with this platform — SSE streaming, webhook payloads, and the
`X-Forwarded-*` headers `TRUST_PROXY_HOPS` depends on all have WAF-specific
gotchas worth knowing before turning one on.
