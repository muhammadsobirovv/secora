import type {
  ScopeItemType,
  ScopeClassification,
} from '../../../prisma-types.js';

export interface ScopeRule {
  id: string;
  type: ScopeItemType;
  pattern: string;
  classification: ScopeClassification;
}

export interface ScopeMatchResult {
  classification: ScopeClassification;
  matchedScopeItemId: string | null;
  matchedPattern: string | null;
}

const IPV4_OCTET = '(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
const IPV4_RE = new RegExp(
  `^${IPV4_OCTET}\\.${IPV4_OCTET}\\.${IPV4_OCTET}\\.${IPV4_OCTET}$`,
);

function ipv4ToInt(ip: string): number | null {
  if (!IPV4_RE.test(ip)) return null;
  const parts = ip.split('.').map(Number);
  return (
    ((parts[0] ?? 0) << 24) +
    ((parts[1] ?? 0) << 16) +
    ((parts[2] ?? 0) << 8) +
    (parts[3] ?? 0)
  );
}

function ipInCidr(ip: string, cidr: string): boolean {
  const [base, prefixStr] = cidr.split('/');
  if (!base || prefixStr === undefined) return false;
  const prefix = Number(prefixStr);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  const ipInt = ipv4ToInt(ip);
  const baseInt = ipv4ToInt(base);
  if (ipInt === null || baseInt === null) return false;
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

function ipInRange(ip: string, range: string): boolean {
  const [start, end] = range.split('-').map((s) => s.trim());
  if (!start || !end) return false;
  const ipInt = ipv4ToInt(ip);
  const startInt = ipv4ToInt(start);
  const endInt = ipv4ToInt(end);
  if (ipInt === null || startInt === null || endInt === null) return false;
  return ipInt >= startInt && ipInt <= endInt;
}

/// Matches a wildcard scope pattern like "*.example.com" — the base domain
/// itself and every direct/nested subdomain match; "*.example.com" does
/// NOT match "notexample.com" (a plain string suffix check would
/// incorrectly match that).
function matchesWildcard(value: string, pattern: string): boolean {
  const base = pattern.replace(/^\*\./, '').toLowerCase();
  const v = value.toLowerCase();
  return v === base || v.endsWith(`.${base}`);
}

function matchesRule(value: string, rule: ScopeRule): boolean {
  const v = value.trim();
  switch (rule.type) {
    case 'DOMAIN':
      return v.toLowerCase() === rule.pattern.toLowerCase();
    case 'WILDCARD':
      return matchesWildcard(v, rule.pattern);
    case 'URL':
    case 'API':
      return v === rule.pattern || v.startsWith(rule.pattern);
    case 'MOBILE_APP':
    case 'CLOUD_ASSET':
    case 'ASN':
      return (
        v.toLowerCase() === rule.pattern.toLowerCase() ||
        v.includes(rule.pattern)
      );
    case 'CIDR':
      return ipInCidr(v, rule.pattern);
    case 'IP_RANGE':
      return ipInRange(v, rule.pattern);
    default:
      return false;
  }
}

/// Classifies `value` (a domain/URL/IP/... string, typically a Target's
/// `value` column) against a program's scope rules. OUT_OF_SCOPE rules
/// always win over IN_SCOPE ones regardless of declaration order — the
/// standard bug bounty convention of narrower out-of-scope carve-outs
/// overriding a broader in-scope wildcard (e.g. "*.example.com" in scope,
/// "internal.example.com" explicitly out). Falls back to UNKNOWN when no
/// rule matches, rather than guessing.
///
/// IPv6 CIDR/range matching is not implemented (returns no match for IPv6
/// input against CIDR/IP_RANGE rules) — a known limitation flagged in ADR
/// 0006; IPv4 covers the overwhelming majority of real bug bounty scope
/// entries.
export function classifyScopeValue(
  value: string,
  rules: ScopeRule[],
): ScopeMatchResult {
  const outOfScopeMatch = rules.find(
    (r) => r.classification === 'OUT_OF_SCOPE' && matchesRule(value, r),
  );
  if (outOfScopeMatch) {
    return {
      classification: 'OUT_OF_SCOPE',
      matchedScopeItemId: outOfScopeMatch.id,
      matchedPattern: outOfScopeMatch.pattern,
    };
  }

  const inScopeMatch = rules.find(
    (r) => r.classification === 'IN_SCOPE' && matchesRule(value, r),
  );
  if (inScopeMatch) {
    return {
      classification: 'IN_SCOPE',
      matchedScopeItemId: inScopeMatch.id,
      matchedPattern: inScopeMatch.pattern,
    };
  }

  // A rule with no explicit classification decision yet (still UNKNOWN)
  // that structurally matches is still worth surfacing as the match
  // reason, even though the overall result stays UNKNOWN.
  const unknownMatch = rules.find(
    (r) => r.classification === 'UNKNOWN' && matchesRule(value, r),
  );
  return {
    classification: 'UNKNOWN',
    matchedScopeItemId: unknownMatch?.id ?? null,
    matchedPatt