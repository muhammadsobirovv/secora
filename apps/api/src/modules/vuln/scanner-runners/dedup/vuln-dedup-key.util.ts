/// The dedup rule as one small, pure, independently-testable function —
/// same philosophy as Module 3's dedup-key.util.ts. VulnFinding's unique
/// constraint is (targetId, scanner, dedupKey); targetId/scanner are
/// already separate DB columns, so this function only needs to fold in
/// the spec's remaining three inputs: Path, Vulnerability Type, Signature.

export function normalizePath(path: string | null): string {
  if (!path) return '/';
  try {
    // Accept either a bare path or a full URL — callers pass whichever
    // they have; only the pathname (+ sorted query keys, so ?b=1&a=2 and
    // ?a=2&b=1 dedup together) matters for identity.
    const url = path.startsWith('http')
      ? new URL(path)
      : new URL(path, 'http://placeholder.local');
    const trimmed = url.pathname.replace(/\/+$/, '') || '/';
    const params = [...url.searchParams.keys()].sort();
    return params.length > 0 ? `${trimmed}?${params.join(',')}` : trimmed;
  } catch {
    return path.trim().toLowerCase();
  }
}

export function vulnFindingDedupKey(
  path: string | null,
  vulnType: string,
  signature: string,
): string {
  return `${normalizePath(path)}::${vulnType.trim().toLowerCase()}::${signature.trim().toLowerCase()}`;
}
