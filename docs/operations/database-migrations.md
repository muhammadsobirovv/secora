# Database Migrations

Operational guide for changing `apps/api/prisma/schema.prisma` in a running
Secora AI deployment. This is Module 18 (Production Hardening) task
#509 — it formalizes practices that already existed (the Module 14
`validate-migrations.mjs` script, `deploy/*/README.md`'s "First-time schema
setup" sections, ADR 0010 point 14) into one place, and adds the checklist
a real operator needs before running a schema change against production
data. It does not introduce a new migration mechanism — this project uses
[Prisma Migrate](https://www.prisma.io/docs/orm/prisma-migrate) exactly as
Prisma ships it.

## The migration-history gap (read this first)

`apps/api/prisma/migrations/` contains real, `prisma migrate dev`-generated
migration files only through Module 5
(`20260501000000_ai_security_copilot`). Every schema change from Module 6
onward — including all of Modules 10, 14, 15, 16, 17, and 18 — was authored
directly by hand: a change to `schema.prisma` plus a hand-written
`migration.sql` file in a matching `YYYYMMDDHHMMSS_description` directory,
because the sandboxed environment this project was built in has no live
Postgres connection to run `prisma migrate dev` against. This is disclosed
in ADR 0010 (point 14) and re-confirmed here — it is not a new problem
introduced by Module 18, and Module 18 does not attempt to retroactively
fix it by regenerating history (that would require a real database and is
squarely a "first team to run this in production" task, described below).

Concretely, this means:

- `prisma migrate deploy` — the correct production command, which applies
  pending migrations from `prisma/migrations/` in order and records them
  in the `_prisma_migrations` table — **can be run against this
  repository's history**, since every migration since Module 6 is a
  real file. What it *cannot* guarantee is that the hand-authored SQL is
  byte-for-byte what `prisma migrate dev` would have generated from the
  same schema diff; it has been written to match `schema.prisma`'s
  resulting shape as closely as possible and reviewed at each module's
  verification pass, but was never run against a live shadow database to
  confirm it (see "What `validate-migrations.mjs` checks" below).
- A **fresh** deployment with no existing data can equally well use
  `prisma db push --skip-generate` (applies the current schema state
  directly, no migration history, no `_prisma_migrations` bookkeeping) —
  this is what every `deploy/*` path's first-time setup instructions use
  today, and remains the simplest correct choice for Community Edition's
  typical single-tenant, self-hosted install.
- An **existing** deployment that already has a `_prisma_migrations` table
  (i.e. was set up with `migrate deploy` at some point) should keep using
  `migrate deploy` for every subsequent change, including this module's —
  see "Applying Module 18's migration" below.

## Migration files added by Module 18

One migration, additive only (new indexes + one new uniqueness constraint;
no columns dropped, renamed, or made non-nullable):

- `20261204000000_database_reliability_indexes_idor` — Phase 6 (database
  reliability review): covering indexes for nine previously-under-indexed
  `workspaceId`-scoped models, plus
  `bugbounty_submissions_workspaceId_platform_externalId_key` (prevents
  duplicate rows when the same external bug-bounty report is re-imported
  or re-synced). See that migration's own header comment for the full
  list and the pre-flight duplicate-check query to run before applying it
  to a database that may already have conflicting rows.

Earlier Module 18 migrations:

- `20261203000000_request_correlation_ids` — Phase 3 (request
  correlation): a nullable `requestId` column on four job/audit tables,
  used to trace a request end-to-end through async job execution and
  structured logs.

## Applying a migration to an existing deployment

1. **Back up first.** Always. This repo's backup system (Module 14,
   `BackupService`) or your own `pg_dump`/managed-Postgres snapshot —
   either is fine, but do not skip this step for an "additive-looking"
   migration. See `docs/operations/backup-recovery.md` (Module 18 Phase
   20) for the restore-tested procedure once that doc exists; until then,
   confirm you can actually restore your chosen backup method before
   relying on it in production.
2. **Review the migration's own header comment.** Every hand-authored
   migration in this repo documents what it changes and any operational
   caveats (e.g. the duplicate-check query above) directly in the SQL
   file — read it before running.
3. **Dry-run the diff against your database**, without applying anything:
   ```bash
   cd apps/api
   DATABASE_URL=<your-connection-string> pnpm run prisma:migrate:validate
   ```
   This runs `scripts/validate-migrations.mjs` (Module 14): it validates
   `schema.prisma` on its own (always), then — if `DATABASE_URL` is set —
   runs `prisma migrate diff` between the migrations directory and your
   live database and reports drift. Drift is expected and non-fatal for
   this repository (see the migration-history gap above); read the actual
   diff output to confirm it matches only the migrations you intend to
   apply, not something unexpected.
4. **Apply it:**
   ```bash
   pnpm run prisma:migrate:deploy   # existing deployment with migration history
   # or, for a fresh install with no _prisma_migrations table yet:
   pnpm run prisma:db:push
   ```
5. **Verify.** Hit `GET /health/ready` (Module 18 Phase 5) — it runs a
   real `SELECT 1` and, on Enterprise Edition with `QUEUE_PROVIDER=redis`/
   `STORAGE_PROVIDER=s3`, checks those too. A clean `200 {"status":"ok"}`
   after the deploy is your first real signal the schema change didn't
   break the running application.

## Writing a new migration (contributors)

Until a team establishes a clean `prisma migrate dev` history against a
real disposable database (recommended — see ADR 0010 point 14 and
`deploy/k8s/README.md`'s "First-time schema setup" section for the
one-time `migrate dev --name <module>_baseline` command that starts one),
follow the pattern every migration since Module 6 uses:

1. Edit `apps/api/prisma/schema.prisma`.
2. Create `apps/api/prisma/migrations/<UTC-timestamp>_<description>/migration.sql`
   by hand, `YYYYMMDDHHMMSS` timestamp strictly after the most recent
   existing migration's, `snake_case` description. Write plain SQL that
   produces the same resulting shape as your schema.prisma edit —
   `CREATE TABLE`/`ALTER TABLE`/`CREATE INDEX`/etc., matching the
   `@@map`/`@map` table and column names in the schema, not the Prisma
   model/field names.
3. Prefer additive changes (new nullable columns, new tables, new
   indexes) over anything destructive. If a column must be dropped or
   made non-nullable, do it in two steps across two releases (add
   nullable → backfill → a later migration drops/tightens) so a rollback
   of the application code doesn't leave the database in a state the old
   code can't read.
4. Run the syntax/structural checks available in this sandbox-constrained
   environment (`ts.transpileModule`-style checks don't apply to `.sql`,
   but do re-run `pnpm run prisma:migrate:validate` if you have a
   `DATABASE_URL` available — CI's Postgres service container, or a local
   Docker Postgres, both work for this).
5. Document the change's rationale directly in the migration file's own
   header comment, same as every existing one — the next person applying
   it to a production database is your primary reader, not a future
   contributor reading the schema.

## Rollback strategy

Prisma Migrate does not generate reversible "down" migrations. This
project's approach, consistent with the additive-by-default discipline
above:

- **Prefer forward fixes.** If a migration causes a problem, the default
  response is a new, small forward migration that corrects it — not an
  attempt to reconstruct the exact prior schema state.
- **For a genuinely broken migration** (e.g. it corrupted data or the
  deploy needs to be aborted entirely), the only reliable rollback is
  restoring the pre-migration backup taken in step 1 above. There is no
  safe automated "undo" for a schema change that has already run against
  live data — do not attempt to hand-write a reverse migration.sql and
  apply it without validating it against a copy of production data first.
- **Application code rollback is independent of schema rollback.** Because
  every migration in this history is additive, rolling the *application*
  back to a previous release while the *database* stays on the newer
  schema is safe by construction — old code simply doesn't reference the
  new columns/tables/indexes. This is why the additive-only discipline in
  "Writing a new migration" matters operationally, not just stylistically.

## What `validate-migrations.mjs` checks (and what it doesn't)

Two checks, in order (see the script's own header comment for the full
rationale):

1. `prisma validate` — schema.prisma is syntactically and referentially
   valid. Always runs, no database required, and a real failure here
   fails the script.
2. If `DATABASE_URL` is set, `prisma migrate diff` between the migrations
   directory and the live database. **Informational only** — it reports
   drift but does not fail the build on it, because this repository's
   hand-authored history is expected to show some drift relative to a
   hypothetical from-scratch `migrate dev` history (see the
   migration-history gap section above). A team that establishes a clean
   history going forward should tighten this to fail on drift once that's
   true — the script's own header comment says exactly this.

What it does **not** check: data-level correctness (whether a backfill
actually ran, whether a new `NOT NULL` column has a sane default for
existing rows), or anything Postgres-version-specific. Those remain a
manual review step before applying to production, per the checklist
above.

## BLOCKED BY ENVIRONMENT (disclosed, not silently skipped)

This sandbox's `prisma` CLI install is broken (`npx prisma validate` /
`npx prisma migrate status` both fail with `Cannot find module
'.../node_modules/prisma/build/index.js'`) — the same defect noted across
Modules 16–18. This means Module 18 could not actually run
`validate-migrations.mjs` against a live database to confirm the new
migration's SQL applies cleanly, nor confirm the duplicate-check query in
its header comment. Structural review (SQL syntax, table/column names
matched against `schema.prisma`'s `@@map`/`@map` directives, brace-balance
check on the schema file) was performed instead and is documented in the
Module 18 Phase 6 summary. A real CI run (`.github/workflows/ci.yml`'s
Postgres service container) or a local `docker compose up postgres` plus
`DATABASE_URL=... pnpm run prisma:migrate:validate` is the first real
verification this migration should get before it reaches production.
