import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/// Module 14 — Auto Update. Reads this package's own `package.json`
/// rather than `process.env.npm_package_version`: that env var is only
/// set when a process is launched *by* npm/pnpm (`npm run <script>`),
/// not when a globally-installed `pentesthub` binary is invoked
/// directly by a user's shell — which is this CLI's primary way of
/// being run. Path is relative to this compiled file's own location
/// (`dist/commands/version.js` → `../../package.json`), which resolves
/// to the same depth whether run compiled or via `tsx` against `src/`.
function readOwnVersion(): string {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const pkgPath = path.join(dir, '../../package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string };
  return pkg.version;
}

export function versionCommand(): void {
  console.log(readOwnVersion());
}

/// Compares two `x.y.z` version strings numerically, part by part —
/// deliberately not the `semver` package: this CLI's stated design goal
/// (see `bin/pentesthub.ts`'s doc comment) is zero runtime dependencies
/// beyond `@pentesthub/sdk`/`@pentesthub/shared`, and a plain numeric
/// compare is all a "is a newer release published?" check needs (no
/// pre-release tag / range logic required).
function isNewer(candidate: string, current: string): boolean {
  const c = candidate.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const b = current.split('.').map((part) => Number.parseInt(part, 10) || 0);
  for (let i = 0; i < Math.max(c.length, b.length); i++) {
    const cPart = c[i] ?? 0;
    const bPart = b[i] ?? 0;
    if (cPart !== bPart) return cPart > bPart;
  }
  return false;
}

/// Module 14 — Auto Update. `pentesthub update` never replaces its own
/// binary in place — it only checks npm's registry (the same source a
/// global install came from, whether that's the public registry or a
/// deployment's private mirror configured via the standard npm
/// `registry` config) and prints the command to run. Silent self-
/// replacement of a CLI binary a user runs with their own permissions is
/// exactly the kind of "runs code without being asked" behavior this
/// platform's own security posture (see docs/security/) argues against
/// elsewhere — the same "check + tell the user" pattern this task
/// applies to mobile app-store updates for the same reason (neither this
/// CLI nor a mobile app is allowed to silently replace itself).
export async function updateCommand(): Promise<void> {
  const current = readOwnVersion();
  const registryUrl = process.env.PENTESTHUB_NPM_REGISTRY ?? 'https://registry.npmjs.org';

  let latest: string;
  try {
    const response = await fetch(`${registryUrl}/@pentesthub/cli/latest`);
    if (!response.ok) {
      throw new Error(`Registry responded ${response.status}`);
    }
    const body = (await response.json()) as { version?: string };
    if (!body.version) {
      throw new Error('Registry response had no "version" field.');
    }
    latest = body.version;
  } catch (error) {
    console.error(
      `Could not check for updates (${error instanceof Error ? error.message : String(error)}). ` +
        `Set PENTESTHUB_NPM_REGISTRY if you use a private mirror.`,
    );
    process.exitCode = 1;
    return;
  }

  if (isNewer(latest, current)) {
    console.log(`Update available: ${current} -> ${latest}`);
    console.log('Run: npm install -g @pentesthub/cli@latest');
  } else {
    console.log(`Up to date (${current}).`);
  }
}
