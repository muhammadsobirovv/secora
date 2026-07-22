/// Minimal semver comparator + range matcher — no external `semver`
/// dependency. Supports exact (`1.2.3`), caret (`^1.2.3`, same major),
/// tilde (`~1.2.3`, same major.minor), and comparison operators
/// (`>=1.2.3`, `<2.0.0`, `>1.0.0`, `<=1.5.0`), space-separated as an
/// implicit AND (`>=1.2.0 <2.0.0`). Pre-release/build-metadata suffixes
/// are ignored (compared as `0` if absent), matching the common case for
/// plugin versions in this marketplace (authors are expected to use plain
/// `MAJOR.MINOR.PATCH`).

interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

function parseSemVer(raw: string): SemVer {
  const core = raw.trim().split(/[-+]/)[0];
  const [major, minor, patch] = core.split('.').map((n) => Number.parseInt(n, 10) || 0);
  return { major: major ?? 0, minor: minor ?? 0, patch: patch ?? 0 };
}

function compareSemVer(a: SemVer, b: SemVer): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

function satisfiesClause(version: SemVer, clause: string): boolean {
  const trimmed = clause.trim();
  if (trimmed.startsWith('^')) {
    const base = parseSemVer(trimmed.slice(1));
    return version.major === base.major && compareSemVer(version, base) >= 0;
  }
  if (trimmed.startsWith('~')) {
    const base = parseSemVer(trimmed.slice(1));
    return version.major === base.major && version.minor === base.minor && compareSemVer(version, base) >= 0;
  }
  const operatorMatch = /^(>=|<=|>|<)(.+)$/.exec(trimmed);
  if (operatorMatch) {
    const [, operator, rest] = operatorMatch;
    const base = parseSemVer(rest);
    const cmp = compareSemVer(version, base);
    switch (operator) {
      case '>=':
        return cmp >= 0;
      case '<=':
        return cmp <= 0;
      case '>':
        return cmp > 0;
      case '<':
        return cmp < 0;
      default:
        return false;
    }
  }
  // Exact match.
  return compareSemVer(version, parseSemVer(trimmed)) === 0;
}

export function satisfiesRange(versionString: string, range: string): boolean {
  const version = parseSemVer(versionString);
  return range
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .every((clause) => satisfiesClause(version, clause));
}

export interface DependencyCheckInput {
  slug: string;
  versionRange: string;
}

export interface DependencyCheckResult {
  slug: string;
  versionRange: string;
  satisfied: boolean;
  installedVersion: string | null;
}

/// Checks each declared dependency against the set of plugins already
/// installed in the same scope (org or workspace). `installed` is
/// `{ slug -> version }` for the target scope's current installations —
/// resolved by the caller (`InstallPluginHandler`) via a join against
/// `PluginInstallation`/`PluginVersion`/`Plugin`, kept here as a pure
/// function for testability.
export function resolveDependencies(
  dependencies: DependencyCheckInput[],
  installed: Record<string, string>,
): DependencyCheckResult[] {
  return dependencies.map((dep) => {
    const installedVersion = installed[dep.slug] ?? null;
    return {
      slug: dep.slug,
      versionRange: dep.versionRange,
      satisfied: installedVersion !== null && satisfiesRange(installedVersion, dep.versionRange),
      installedVersion,
    };
  });
}
