# Secrets Management

Module 14 catalog of every secret this platform can be configured with, where
each one is generated, how it's stored per deployment path, and the rotation
story for each. This is the operator-facing counterpart to `.env.example`'s
inline comments — read this before a production rollout, not just the example
files.

## What counts as a secret here

Anything that grants access to data or systems if leaked: JWT signing keys,
symmetric encryption keys, database credentials, OAuth client secrets,
third-party API keys (AI providers, integrations), and the Redis/MinIO
passwords the Enterprise overlay introduces. `IP_ALLOWLIST` and
`MTLS_REQUIRED` are security *controls*, not secrets, and are covered in
[`tls-mtls-certificates.md`](./tls-mtls-certificates.md) instead.

## Secret inventory

| Variable | Purpose | Required? | Rotatable without downtime? |
|---|---|---|---|
| `JWT_ACCESS_SECRET` | Signs/verifies access + refresh tokens | Always | No — rotating invalidates every live session; see below |
| `CREDENTIAL_ENCRYPTION_KEY` | AES-256-GCM key for BYOK AI provider credentials at rest (`apps/api/src/common/utils/buffer-encryption.util.ts`) | Always | No — rotating without a re-encryption pass makes existing stored credentials undecryptable |
| `BACKUP_ENCRYPTION_KEY` | AES-256-GCM key for encrypted `BackupPolicy` runs (mirrors `CREDENTIAL_ENCRYPTION_KEY`'s scheme) | Only if any `BackupPolicy.encrypt = true` (the default) | No — rotating makes prior backups undecryptable with the new key; keep the old key archived alongside old backups instead of discarding it |
| `DATABASE_URL` (credentials portion) | Postgres connection | Always | Yes — Postgres role passwords can be changed independently of an app deploy; see below |
| `REDIS_PASSWORD` / `REDIS_URL` | Redis auth (`docker-compose.enterprise.yml`, `deploy/k8s/13-redis.yaml`) | Only if `QUEUE_PROVIDER=redis` or `CACHE_PROVIDER=redis` | Yes — `requirepass` can be changed and rolled out with a brief reconnect window |
| `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | MinIO admin credentials (`docker-compose.enterprise.yml`, `deploy/k8s/14-minio.yaml`) | Only if `STORAGE_PROVIDER=s3` pointed at the bundled MinIO | Yes, but prefer per-application access keys over rotating root credentials in a running deployment |
| `STORAGE_S3_ACCESS_KEY_ID` / `STORAGE_S3_SECRET_ACCESS_KEY` | S3-compatible object storage credentials | Only if `STORAGE_PROVIDER=s3` | Yes — most S3-compatible providers support issuing a second key, cutting over, then revoking the old one |
| OAuth `*_CLIENT_SECRET` vars (Google, GitHub, etc.) | Third-party OAuth app secrets | Only for the providers you enable | Yes, from the provider's own console; both old and new work during the provider's own grace period, if any |
| AI provider API keys (platform-level, not BYOK) | Calling AI providers when a workspace hasn't configured its own BYOK credential | Only if platform-level AI features are enabled without BYOK | Yes — provider consoles typically support multiple live keys during cutover |

## Generation

Every secret above that's a random symmetric key (not a password you choose or
an API key a provider issues) should be generated with a cryptographically
secure random generator, never typed by hand. This repo's own tooling:

```bash
# 48 random bytes, base64 — used for JWT_ACCESS_SECRET and similar
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"

# 32 random bytes, base64 — used for CREDENTIAL_ENCRYPTION_KEY / BACKUP_ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

`deploy/installer/lib.sh`'s `gen_secret()` runs the equivalent (falling back to
`openssl rand` if Node isn't on `PATH`) and is what `install.sh` uses to
populate a fresh `.env`/`.env.enterprise` — see that script rather than typing
these commands by hand for a first-time install.

**Never reuse the same value across `JWT_ACCESS_SECRET`, `CREDENTIAL_ENCRYPTION_KEY`,
and `BACKUP_ENCRYPTION_KEY`.** They protect different things with different
blast radii if leaked; a single shared secret means one leak compromises all
three.

## Storage per deployment path

- **Docker Compose (`install.sh`, `docker-compose.yml`/`.enterprise.yml`)**:
  secrets live in a `.env` file read by Compose's `env_file:` directive. This
  file must not be committed — `.gitignore` already excludes `.env*` except the
  `.example` templates. File permissions matter here: `chmod 600 .env` on any
  shared host.
- **Kubernetes (`deploy/k8s/`)**: `02-secret.yaml.example` documents creating a
  `Secret` imperatively (`kubectl create secret generic ... --from-literal=...`)
  rather than committing a filled-in YAML file, and recommends an
  external-secrets operator (External Secrets Operator, Sealed Secrets, or a
  cloud provider's native secret manager synced via CSI) for anything beyond a
  single-operator test cluster — a plain Kubernetes `Secret` is only
  base64-encoded, not encrypted, at rest unless the cluster has encryption at
  rest enabled for the `Secret` resource type specifically (most managed
  Kubernetes offerings support this; it's not on by default).
- **systemd / Windows service (`deploy/linux/`, `deploy/windows/`)**: same
  `.env` file convention, loaded via `EnvironmentFile=` (systemd) or read at
  process start (the Windows service wrapper); same file-permission guidance
  applies.

## Rotation

Rotation strategy differs by category:

- **Stateless signing keys** (`JWT_ACCESS_SECRET`): rotating immediately
  invalidates every access and refresh token signed with the old key — every
  logged-in user is forced to re-authenticate. There is no dual-key
  verification window implemented (accepting tokens signed by either the old
  or new key during a grace period) — if that's needed for a large user base,
  it's an application change, not a config change, and isn't in scope for this
  module. Plan a rotation for a maintenance window, not a live cutover.
- **Data-encryption keys** (`CREDENTIAL_ENCRYPTION_KEY`, `BACKUP_ENCRYPTION_KEY`):
  rotating the key without re-encrypting existing ciphertext makes that
  ciphertext permanently undecryptable. There is no built-in re-encryption
  job. If a genuine rotation is required (e.g. suspected key compromise), it
  requires: (1) decrypt every affected row/backup with the old key, (2)
  re-encrypt with the new key, (3) only then remove the old key from
  configuration. Treat this as a one-off migration script, not a routine
  operation — and back up before running it.
- **Passwords/credentials for infrastructure you control** (Postgres role
  password, Redis `requirepass`, MinIO root credentials): these support a real
  rotation because the *server* (Postgres/Redis/MinIO), not application-level
  ciphertext, is what validates them. Change the password on the server first,
  then update `.env`/the `Secret` and restart the app tier — brief
  reconnect-required downtime, not data loss.
- **Third-party credentials** (OAuth client secrets, AI provider API keys, S3
  access keys): rotate from the provider's own console, which typically lets
  you have two valid credentials briefly overlapping — issue the new one,
  update this platform's config, verify, then revoke the old one from the
  provider side. No coordination needed with this platform beyond updating
  the env var and restarting/redeploying.

None of the above is automated by a scheduled job in this repository — secret
rotation here is a documented manual procedure, consistent with this module's
overall posture of disclosing what's a starting point versus what's fully
automated (see `deploy/README.md`'s "What's genuinely production-hardened vs.
what's a starting point" section). TLS certificate rotation is the one
exception with real automation available — see
[`tls-mtls-certificates.md`](./tls-mtls-certificates.md).
