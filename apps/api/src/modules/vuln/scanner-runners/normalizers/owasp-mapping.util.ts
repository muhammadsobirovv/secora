import type { OwaspCategory } from '../../../../prisma-types.js';

/// Best-effort tag/keyword -> OWASP Top 10:2021 category heuristic, shared
/// by every normalizer that doesn't get an explicit category from its
/// scanner (none of the v1 scanners do — only Nuclei's CWE id could be
/// mapped more precisely, which is a future refinement, not required for
/// v1). Order matters: first match wins, most-specific categories first.
const KEYWORD_RULES: Array<[RegExp, OwaspCategory]> = [
  [
    /sqli|sql-injection|nosqli|command-injection|rce|ssti|xxe|ldap-injection/i,
    'A03_INJECTION',
  ],
  [/xss|cross-site-scripting/i, 'A03_INJECTION'],
  [/ssrf/i, 'A10_SERVER_SIDE_REQUEST_FORGERY'],
  [
    /auth|login|credential|default-logins?|weak-password/i,
    'A07_IDENTIFICATION_AUTH_FAILURES',
  ],
  [
    /access-control|idor|privilege|traversal|lfi|directory-listing/i,
    'A01_BROKEN_ACCESS_CONTROL',
  ],
  [/tls|ssl|crypto|cert(ificate)?|hsts/i, 'A02_CRYPTOGRAPHIC_FAILURES'],
  [
    /cve|outdated|vulnerable-component|eol|end-of-life/i,
    'A06_VULNERABLE_OUTDATED_COMPONENTS',
  ],
  [
    /misconfig|exposure|panel|debug|backup|config|default-file/i,
    'A05_SECURITY_MISCONFIGURATION',
  ],
  [/log|audit|monitor/i, 'A09_LOGGING_MONITORING_FAILURES'],
  [
    /deserialization|integrity|supply-chain/i,
    'A08_SOFTWARE_DATA_INTEGRITY_FAILURES',
  ],
];

export function mapKeywordsToOwaspCategory(keywords: string[]): OwaspCategory {
  const joined = keywords.join(' ');
  for (const [pattern, category] of KEYWORD_RULES) {
    if (pattern.test(joined)) return category;
  }
  return 'UNKNOWN';
}

const SEVERITY_MAP: Record<
  string,
  'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
> = {
  info: 'INFO',
  informational: 'INFO',
  low: 'LOW',
  medium: 'MEDIUM',
  moderate: 'MEDIUM',
  high: 'HIGH',
  critical: 'CRITICAL',
  unknown: 'INFO',
};

export function mapSeverityString(
  raw: string | undefined,
): 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  if (!raw) return 'INFO';
  return SEVERITY_MAP[raw.trim().toLowerCase()] ?? 'INFO';
}
