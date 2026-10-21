import { assertSafeHost } from './tool-catalog.js';

export interface ScopePartition {
  inScope: string[];
  /// Hosts that were dropped, with the reason to write in the job log.
  skipped: { host: string; reason: 'OUTSIDE_VERIFIED_APEX' | 'INVALID_HOST' }[];
}

/// True when `host` is the verified apex or a subdomain of it. A lookalike
/// ("evilexample.com" for apex "example.com") is NOT inside the apex.
export function isWithinApex(host: string, apex: string): boolean {
  return host === apex || host.endsWith(`.${apex}`);
}

/// Splits discovered hosts into those a later stage may touch and those it
/// may not. Duplicates collapse; everything is lowercased and trailing dots
/// removed first, so the comparison cannot be fooled by casing or FQDN form.
export function partitionByApex(candidates: string[], apex: string): ScopePartition {
  const normalizedApex = assertSafeHost(apex);
  const seen = new Set<string>();
  const result: ScopePartition = { inScope: [], skipped: [] };

  for (const raw of candidates) {
    let host: string;
    try {
      host = assertSafeHost(raw);
    } catch {
      result.skipped.push({ host: raw, reason: 'INVALID_HOST' });
      continue;
    }
    if (seen.has(host)) continue;
    seen.add(host);
    if (isWithinApex(host, normalizedApex)) {
      result.inScope.push(host);
    } else {
      result.skipped.push({ host, reason: 'OUTSIDE_VERIFIED_APEX' });
    }
  }
  return result;
}
