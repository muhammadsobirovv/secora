# Secora AI — Installer Suite (Module 14)

Operator-facing scripts covering the full lifecycle of a Docker Compose
deployment: install, configure, back up, upgrade, roll back, and health-check.
These complement, rather than replace, `deploy/linux/install.sh`,
`deploy/windows/install-service.ps1`, and `deploy/k8s/` — see the root
`deploy/README.md` for how all the paths relate.

| Script | Module 14 concept | What it does |
|---|---|---|
| `install.sh` | Interactive Installer + CLI Installer | First-time setup: generates `.env`, brings up Docker Compose, applies the schema. Interactive by default; `--non-interactive` + flags for scripted use. |
| `quick-install.sh` | One Command Installer | `curl \| bash` entry point — clones the repo and calls `install.sh --non-interactive` with Community Edition defaults. |
| `configure.sh` | Configuration Wizard | Edits an existing `.env` in place (domain, edition, providers, OAuth) without touching already-set secrets. |
| `health-check.sh` | Health Check | Hits liveness/readiness/startup endpoints; exit code reflects overall health — usable in cron or CI. |
| `backup-wizard.sh` | Backup Wizard | Triggers a real backup via the Backup System API, or falls back to a direct offline `pg_dump` if the API is unreachable. |
| `upgrade.sh` | Upgrade Wizard | Records current version, backs up, pulls a target ref, rebuilds, migrates, restarts, health-checks. |
| `rollback.sh` | Rollback Support | Reverts to the ref `upgrade.sh` recorded, optionally restoring the pre-upgrade database backup. |
| `recovery-test.sh` | Recovery Testing | Downloads the latest backup, restores it into a throwaway scratch database, and sanity-queries it — proves the backup is actually restorable, not just present. Run periodically (e.g. weekly cron), separately from any real incident. |
| `lib.sh` | — | Shared helpers (state file, deployment-type detection, secret generation). Not run directly. |

## State file

All scripts share a small `.pentesthub-installer-state` file (repo root by
default, override with `PENTESTHUB_STATE_FILE`) recording the deployment
type, current/previous git ref, and the last pre-upgrade backup location.
It's plain `KEY=value` text — safe to `cat` or hand-edit if something needs
correcting. It is not a substitute for the real Backup System's `BackupRun`
records (see `apps/api/src/modules/backups/backup.service.ts`); it only
tracks what this specific set of scripts needs to find its own prior work.

## Typical flow

```bash
# First time
./deploy/installer/install.sh

# Later, when you need to change a setting
./deploy/installer/configure.sh

# Before anything risky
./deploy/installer/backup-wizard.sh

# Routine health check (e.g. from cron)
./deploy/installer/health-check.sh --quiet

# Shipping a new version
./deploy/installer/upgrade.sh --ref v1.5.0

# If that upgrade turns out to be bad
./deploy/installer/rollback.sh --restore-backup

# Periodically (e.g. weekly, via cron) — prove backups actually restore
./deploy/installer/recovery-test.sh --api-url https://your-deployment --token "$API_TOKEN"
```

## Disaster recovery: PITR and failback

**Point-in-time recovery (PITR).** `backup-wizard.sh` / `BackupService` take
discrete `pg_dump` snapshots — restoring one recovers the database to the
moment that snapshot was taken, not to an arbitrary point in between. True
PITR (replay to any timestamp, e.g. "5 minutes before the bad migration
ran") requires Postgres-level WAL archiving — a tool like `wal-g` or
`pgBackRest`, or a managed Postgres provider's built-in PITR (RDS, Cloud
SQL, Neon, etc.) — configured at the infrastructure layer, outside this
application. This is a deliberate scope boundary, not an oversight: WAL
archiving is an operator/infrastructure concern that varies by where
Postgres itself is hosted, and baking one specific WAL-archiving tool into
the app would force that choice on every deployment, including Community
Edition installs that don't need it. If your deployment requires true PITR,
set up WAL archiving for your Postgres instance independently and use
`recovery-test.sh`'s scratch-database pattern as a model for testing that
recovery path too.

**Failback.** After a failover to a secondary/DR environment,
`rollback.sh --restore-backup` is the same mechanism in reverse: check out
the original ref (or the current one, if the failover environment was kept
up to date) against the primary environment, run `prisma:migrate:deploy` to
bring its schema current, restore the most recent backup taken *from the
secondary* while it was serving traffic (via `backup-wizard.sh`'s API mode
or `--offline` fallback, run against the secondary before switching back),
then repoint DNS/load-balancer config at the primary. `upgrade.sh` and
`rollback.sh` are both git-ref-based and assume a single Docker
Compose/systemd host; a multi-region or Kubernetes failback should follow
the same shape (checkout → migrate → restore-latest-secondary-backup →
repoint traffic) via `deploy/k8s/README.md`'s tooling instead of these
scripts directly.

## What this suite deliberately does not do

- **Kubernetes.** `upgrade.sh` detects a Kubernetes deployment and points you
  at `deploy/k8s/README.md`'s `kubectl set image` flow instead of trying to
  drive `kubectl` itself — image-tag rollouts and Helm/GitOps pipelines are a
  different operational model than these scripts' git-checkout-based flow.
- **Automatic rollback on failed health check.** `upgrade.sh` prints the
  `rollback.sh` command and exits non-zero; it does not run it for you. An
  upgrade script that silently reverts on what might be a flaky health check
  can mask a real, worse problem.
- **Encrypting offline backups.** `backup-wizard.sh --offline` is a
  disaster-recovery fallback for when the API itself is down, not a
  replacement for the real (encrypted, checksummed) `BackupService` path —
  see that script's header comment.
