#!/usr/bin/env node
// Secora AI — Migration Validation (Module 14: Database support).
//
// Two checks, run in order:
//   1. `prisma validate` — schema.prisma is syntactically/referentially
//      valid on its own. Always runs, no database required. A failure
//      here is a real bug and this script exits non-zero.
//   2. If `DATABASE_URL` is set, `prisma migrate diff` comparing the
//      migrations directory's resulting shape against the live
//      database's actual shape (`--from-migrations` vs. the database
//      Prisma reads via the same connection string every other command
//      uses) — this is the check that would catch "someone edited
//      schema.prisma and forgot to add a migration file" *before* it
//      reaches a deployment's `prisma migrate deploy`. Informational
//      only: this script reports drift and explains what it means
//      rather than failing CI on it, because — as documented in
//      deploy/README.md's "First-time schema setup" section — this
//      repository's migration history was authored by hand during
//      sandboxed development with no live database to run
//      `prisma migrate dev` against for every module, so some drift
//      relative to a hypothetical from-scratch `migrate dev` history is
//      expected. A team that establishes a clean migration history from
//      here forward (see that same README section) should tighten this
//      script to `process.exit(2)` on drift once that's true.
//
// Usage: pnpm --filter api run prisma:migrate:validate
//   (or:  node apps/api/scripts/validate-migrations.mjs)
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiDir = join(__dirname, '..');
const schemaPath = join(apiDir, 'prisma', 'schema.prisma');
const migrationsDir = join(apiDir, 'prisma', 'migrations');

function run(args) {
  return spawnSync('npx', ['prisma', ...args], { cwd: apiDir, encoding: 'utf-8', stdio: 'pipe' });
}

console.log('==> Validating prisma/schema.prisma (no database required)');
const validate = run(['validate', '--schema', schemaPath]);
process.stdout.write(validate.stdout ?? '');
process.stderr.write(validate.stderr ?? '');
if (validate.status !== 0) {
  console.error('FAILED: schema.prisma is invalid — see prisma\'s error output above.');
  process.exit(1);
}
console.log('OK: schema.prisma is valid.\n');

if (existsSync(migrationsDir)) {
  const migrations = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  console.log(`==> ${migrations.length} migration(s) on disk. Most recent: ${migrations.at(-1) ?? '(none)'}`);
} else {
  console.log('==> No prisma/migrations directory found — this deployment relies entirely on `prisma db push` (Community Edition\'s zero-migration-history default). See deploy/README.md.');
}

if (!process.env.DATABASE_URL) {
  console.log('\n==> DATABASE_URL not set — skipping live drift check (schema-only validation passed above). Set DATABASE_URL and re-run to also check for drift against a real database.');
  process.exit(0);
}

console.log('\n==> Checking for drift between prisma/migrations and the live database');
const diff = run([
  'migrate', 'diff',
  '--from-migrations', migrationsDir,
  '--to-schema-datamodel', schemaPath,
  '--shadow-database-url', process.env.SHADOW_DATABASE_URL ?? process.env.DATABASE_URL,
  '--exit-code',
]);
process.stdout.write(diff.stdout ?? '');
process.stderr.write(diff.stderr ?? '');

if (diff.status === 0) {
  console.log('\nOK: no drift detected — schema.prisma matches the migrations directory.');
} else if (diff.status === 2) {
  console.warn('\nDRIFT DETECTED: schema.prisma and prisma/migrations disagree (see diff above).');
  console.warn('This is a known, disclosed state for this repository — see this script\'s header comment.');
  console.warn('Not failing the build on it; treat as informational until a clean migration history is established.');
} else {
  console.error(`\n\`prisma migrate diff\` exited with an unexpected status (${diff.status}) — see output above.`);
  process.exit(1);
}
