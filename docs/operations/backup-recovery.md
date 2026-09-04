# Backup & Disaster Recovery

Module 18 — task #522 (Phase 20: backup/recovery operator documentation).
This documents the real backup and recovery system built in Module 14 and
extended since — every endpoint, script, and behavior below exists in the
codebase today. It also resolves three dead cross-references discovered
while writing this doc: `apps/api/src/modules/backups/backup.service.ts`
and `apps/api/prisma/schema.prisma` pointed at `docs/deploy/*.md` files,
and `deploy/installer/recovery-test.sh` pointed at
`docs/deployment/DISASTER_RECOVERY.md` — neither `docs/deploy/` nor
`docs/deployment/` exists anywhere in this repository. All three have been
updated to point here.

## 1. What gets backed up, and how

`BackupService` (`apps/api/src/modules/backups/backup.service.ts`) supports
four scopes, selectable per backup:

- **DATABASE** — a real `pg_dump --format=custom` against `DATABASE_URL`
  (the binary is `BACKUP_PG_DUMP_BIN`, configurable), piped through gzip
  without touching disk, then optionally AES-256-GCM encrypted
  (`BACKUP_ENCRYPTION_KEY`), checksummed (SHA-256), and uploaded through
  the `StorageService` abstraction — local disk for Community Edition,
  S3-compatible storage for a larger deployment.
- **CONFIGURATION** — a JSON snapshot of non-secret deployment
  configuration (edition, which provider each abstraction is bound to).
  Deliberately never includes actual secret values (JWT signing keys,
  encryption keys, provider API keys) — those live in the deployment's own
  `.env`/secrets manager and are the operator's responsibility to back up
  through that channel (see `docs/security/secrets-management.md`).
- **STORAGE** — copies every object under an organization's workspaces to
  a dated backup prefix and writes a manifest (key → size/checksum). This
  is a full re-copy that scales linearly with total stored bytes; a large
  evidence library should rely on the storage provider's own bucket
  replication/versioning for day-to-day protection and reserve this for
  periodic full-archive snapshots.
- **FULL** — runs DATABASE first (its result is the "primary" `BackupRun`
  returned to the caller), then triggers STORAGE and CONFIGURATION as
  separate, independently visible `BackupRun` rows. Run sequentially, not
  in parallel, since `pg_dump` and a full storage copy both saturate
  disk/network I/O on a single-box deployment.

Every execution is recorded as one `BackupRun` row (Prisma model, in
`apps/api/prisma/schema.prisma`) — `status` (`PENDING`/`RUNNING`/
`SUCCEEDED`/`FAILED`), `storageKey`, `sizeBytes`, `checksumSha256`,
`encrypted`, `errorMessage`, `verifiedAt`. `BackupPolicy` rows are the
schedule/config (`frequency`: `HOURLY`/`DAILY`/`WEEKLY`/`MONTHLY`,
`retentionCount`, `scope`, `encrypt`).

## 2. Scheduling and retention

`BackupPolicyRunnerService`
(`apps/api/src/modules/compliance/services/backup-policy-runner.service.ts`)
polls hourly (gated by `PollerLeaseService` so only one replica in a
multi-instance deployment runs due backups per tick), triggers any
`BackupPolicy` whose `frequency` interval has elapsed since
`lastBackupAt`, and then prunes: it keeps the most recent `retentionCount`
`SUCCEEDED` runs for that policy's organization and deletes the rest —
both the storage object and the `BackupRun` row — so the Admin Console's
Backups page never shows a run whose archive no longer exists.

## 3. Triggering and inspecting backups

**Via the API** (`BackupsController`, `apps/api/src/modules/backups/controllers/backups.controller.ts`,
mounted at `/backups/:organizationId/runs`; use the literal segment
`_system` for a Community Edition single-tenant deployment with no
organization scope):

- `POST /backups/:organizationId/runs` — trigger a manual backup
  (`{ scope, encrypt }` body; `scope` defaults to `FULL`, `encrypt`
  defaults to `true`).
- `GET /backups/:organizationId/runs` — list recent runs (Admin Console's
  "Backups" page).
- `GET /backups/:organizationId/runs/:id` — get one run's status.
- `GET /backups/:organizationId/runs/:id/download` — download the raw
  archive, exactly as stored (still gzipped/encrypted — this endpoint
  deliberately never decrypts server-side, so a decrypted backup body
  never transits as an HTTP response).
- `GET /backups/:organizationId/runs/:id/restore-instructions` — returns
  the exact, scope-specific manual restore procedure (see section 4).
- `POST /backups/:organizationId/runs/:id/verify` — re-downloads the
  archive and re-checksums it against what was recorded at backup time,
  proving the stored object wasn't silently corrupted or truncated. This
  does **not** prove the archive actually restores with `pg_restore` — see
  section 5 for that.

**Via the CLI wizard** (`deploy/installer/backup-wizard.sh`) — a thin
operator-facing wrapper, not a reimplementation:

```
./deploy/installer/backup-wizard.sh --api-url http://localhost:3000 --token "$API_TOKEN" [--org <id>] [--scope FULL|DATABASE|STORAGE|CONFIGURATION]
```

This calls the same `POST /backups/.../runs` endpoint above. If the API is
unreachable (or `--offline` is passed), it falls back to running
`pg_dump` directly against the Postgres container via `docker compose
exec` — this offline path does **not** encrypt or checksum the way
`BackupService` does; it's a last resort for when the API itself is down,
not a substitute for the real thing.

## 4. Restoring — always manual, never one-click, by design

There is no "restore" button anywhere in this system (see ADR 0014) —
restoring is destructive by nature (it overwrites a target database), so
every path ends in a human running an explicit command against a target
the operator chooses. `GET .../restore-instructions` returns the exact
steps for a given `BackupRun`, branching on `scope` and `encrypted`:

1. Download the archive (`.../download`, or `backup-wizard.sh`'s restore
   helper).
2. If encrypted: decrypt it. The layout is `iv(12 bytes) || authTag(16
   bytes) || ciphertext`, AES-256-GCM — see
   `apps/api/src/common/utils/buffer-encryption.util.ts#decryptBuffer`, or
   run it through a small Node script using the same
   `BACKUP_ENCRYPTION_KEY` the deployment used at backup time.
3. `gunzip` the (decrypted) archive.
4. For DATABASE/FULL scope: restore into a **target** database — never
   directly over a live production database without a maintenance window
   — with `pg_restore --dbname=<TARGET_DATABASE_URL> --clean --if-exists
   backup.sql` (the exact binary is `BACKUP_PG_RESTORE_BIN`).
5. For STORAGE scope: the archive is a JSON manifest of `{ key,
   sizeBytes, backedUpKey }` — download each `backedUpKey` object and
   re-upload it to its original `key` in the target deployment's storage
   provider.
6. For CONFIGURATION scope: the archive is a JSON snapshot of non-secret
   config — cross-reference it against the target deployment's `.env` and
   adjust provider selections manually; it intentionally contains no
   secret values to restore automatically.

## 5. Recovery testing — proving a backup actually restores

`deploy/installer/recovery-test.sh` is the concrete difference between "we
have a backup file" and "we have verified the backup file actually
restores to a working database." `BackupService.verify()` (section 3) only
re-checksums the archive's bytes — it does not prove `pg_restore` succeeds
against it, which is the exact failure mode this script exists to catch
(for example, a `pg_dump` that produced a truncated or corrupt
custom-format archive that still passes a checksum on the bytes it did
write).

```
./deploy/installer/recovery-test.sh --api-url http://localhost:3000 --token "$API_TOKEN" [--org <id>] [--keep-scratch]
```

It fetches the most recent `SUCCEEDED` DATABASE/FULL backup run, downloads
and (if needed) decrypts and decompresses the archive, creates a scratch
Postgres database (`pentesthub_recovery_test_<timestamp>`), runs
`pg_restore` into it, checks that the restored database has at least one
table in the `public` schema, then drops the scratch database (unless
`--keep-scratch` is passed). A non-zero exit means the backup run may not
be safely restorable and should be investigated before being relied on.
Run this periodically — weekly via cron or a scheduled CI job is a
reasonable starting cadence — since a backup that silently stopped being
restorable weeks ago is far worse than one that visibly failed today.

## 6. Failback

There is no automated failback tooling in this codebase beyond the primitives
above — failback (returning to a primary after operating from a recovered
instance) is the same restore procedure in section 4, run in the opposite
direction, plus whatever DNS/load-balancer cutover the deployment's own
infrastructure requires. This is intentionally left as an operator
procedure rather than an automated one: failback decisions (is the
original primary actually healthy again, is there data written to the
recovery instance that needs to be reconciled first) require human
judgment this system cannot safely automate.

## 7. Known gaps (disclosed, not fixed in this phase)

- **Cross-region/off-site replication is not built in.** Backups land
  wherever `STORAGE_PROVIDER` points (local disk or one S3-compatible
  bucket) — there is no automatic secondary-region copy. An operator
  wanting geographic redundancy should configure their storage provider's
  own cross-region replication (S3 CRR, R2's built-in redundancy, etc.) on
  top of this system, not expect PentestHub AI to do it.
- **No point-in-time recovery (PITR).** Backups are periodic full
  snapshots (`pg_dump`), not continuous WAL archiving — recovery is only
  possible to the moment of the most recent successful backup, not to an
  arbitrary point in time between backups. A deployment with a genuine PITR
  requirement should use its managed Postgres provider's native PITR
  feature (most managed Postgres offerings provide one) rather than this
  application-level dump mechanism.
- **`recovery-test.sh`'s sanity check is shallow** — it confirms the
  restored database has at least one table, not that the data is complete
  or that row counts match the source. A stronger check (e.g. comparing
  table row counts or a checksum of a known table against the live
  database) is a reasonable follow-up but wasn't added here since it would
  need to run against a real database in this sandbox to verify, which
  isn't possible in this environment.

## 8. BLOCKED BY ENVIRONMENT

This phase's work was documentation and dead-link fixes only — no backup
or restore command was executed in this sandbox (no live Postgres/storage
backend is running here to safely test `pg_dump`/`pg_restore` against).
The described behavior is derived from reading the actual implementation
(`backup.service.ts`, `backup-policy-runner.service.ts`,
`backups.controller.ts`, both installer scripts) in full, not from
executing it. An operator following section 5's recovery-test procedure
against a real deployment is the actual verification step for this
system's correctness.
