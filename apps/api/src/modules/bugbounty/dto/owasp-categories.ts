import type { OwaspCategory } from '@pentesthub/shared';

/// The OWASP Top 10 (2021) category codes, as class-validator's `@IsIn`
/// allow-list — same values as Module 4's `OwaspCategory` (vuln.ts),
/// reused here rather than redefined so a finding's OWASP mapping always
/// means the same thing whether it came from a Vuln scanner or a manual
/// bug bounty finding.
export const OWASP_CATEGORIES: OwaspCategory[] = [
  'A01_BROKEN_ACCESS_CONTROL',
  'A02_CRYPTOGRAPHIC_FAILURES',
  'A03_INJECTION',
  'A04_INSECURE_DESIGN',
  'A05_SECURITY_MISCONFIGURATION',
  'A06_VULNERABLE_OUTDATED_COMPONENTS',
  'A07_IDENTIFICATION_AUTH_FAILURES',
  'A08_SOFTWARE_DATA_INTEGRITY_FAILURES',
  'A09_LOGGING_MONITORING_FAILURES',
  'A10_SERVER_SIDE_REQUEST_FORGERY',
];
