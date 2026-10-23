import type {
  OwaspCategory,
  VulnFindingSeverity,
  VulnScanner,
} from '../../../prisma-types.js';
import type {
  ReportConfidence,
  ReportGrade,
  ReportVerificationDto,
  VerificationStatus,
} from '@pentesthub/shared';

/// One finding model for every tool, de-duplicated across tools.
///
/// SEVERITY RULES (also in docs/operations/pentest-tools.md)
///  1. Severity comes from the tool that reported the finding (the template's
///     own severity for nuclei; the fixed table in stage-findings.ts and
///     checks/analyzers.ts for the others). Nothing in this module or in the AI
///     explanation can change it.
///  2. When several tools report the same issue on the same asset, they become
///     one finding whose severity is the HIGHEST any of them assigned. Merging
///     never invents a severity: it only keeps the strictest existing one.
///  3. Re-verification never changes severity. It only decides confidence.
///
/// CONFIDENCE RULES
///  - CONFIRMED: a safe re-check (one GET through the pinning proxy) reproduced
///    the issue. Nothing else is CONFIRMED, not even a tool that says so.
///  - LIKELY: a tool reported it and it was not re-checked, or the re-check did
///    not reproduce it (then the verification status says so).
///  - INFO: informational severity.

export interface RawFinding {
  id: string;
  scanner: VulnScanner;
  title: string;
  description: string;
  severity: VulnFindingSeverity;
  vulnType: string;
  signature: string;
  path: string | null;
  matchedAt: string;
  data: Record<string, unknown>;
  tags: string[];
  references: string[];
  cwe: string | null;
  owaspCategory: OwaspCategory | null;
  evidence: {
    request: string | null;
    response: string | null;
    payload: string | null;
  };
}

export interface MergedFinding {
  issueKey: string;
  /// "host" or "host/path", the asset the issue is on.
  asset: string;
  host: string;
  path: string | null;
  affected: string;
  severity: VulnFindingSeverity;
  primary: RawFinding;
  members: RawFinding[];
}

export const SEVERITY_RANK: Record<VulnFindingSeverity, number> = {
  INFO: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

/// Which tool's wording and evidence lead when several report the same thing:
/// the most specific first.
const TOOL_PRIORITY: VulnScanner[] = [
  'DALFOX',
  'SECORA_CHECKS',
  'NUCLEI',
  'FFUF',
  'NAABU',
  'DIRSEARCH',
  'FEROXBUSTER',
  'NIKTO',
  'SUBFINDER',
];

// ---------------------------------------------------------------------------
// Canonical issue classes
// ---------------------------------------------------------------------------

/// nuclei template ids that are the same issue as a native check or an ffuf hit.
const NUCLEI_ALIASES: Record<string, string> = {
  'git-config': 'exposed-git',
  'git-head': 'exposed-git',
  'git-credentials': 'exposed-git',
  'laravel-env': 'exposed-env',
  'generic-env': 'exposed-env',
  'codeigniter-env': 'exposed-env',
  'env-file': 'exposed-env',
  'dotenv-file': 'exposed-env',
  'prometheus-metrics': 'exposed-metrics',
  'swagger-api': 'exposed-api-docs',
  openapi: 'exposed-api-docs',
  'springboot-actuator': 'exposed-actuator',
  'phpinfo-files': 'exposed-phpinfo',
  'svn-detect': 'exposed-svn',
  'http-missing-security-headers': 'headers-summary',
};

/// ffuf paths -> the same classes.
const PATH_CLASSES: { pattern: RegExp; key: string }[] = [
  { pattern: /(^|\/)\.git(\/|$)/i, key: 'exposed-git' },
  { pattern: /(^|\/)\.svn(\/|$)/i, key: 'exposed-svn' },
  { pattern: /(^|\/)\.env($|\.)/i, key: 'exposed-env' },
  { pattern: /\.(sql|bak|zip|tar\.gz|tgz|gz)$/i, key: 'exposed-backup' },
  { pattern: /(^|\/)(metrics|prometheus)(\/|$)/i, key: 'exposed-metrics' },
  {
    pattern: /(^|\/)(swagger(-ui)?(\.json)?|openapi\.json|api-docs)(\/|$)/i,
    key: 'exposed-api-docs',
  },
  { pattern: /(^|\/)actuator(\/|$)/i, key: 'exposed-actuator' },
  { pattern: /(^|\/)(phpinfo|info)\.php$/i, key: 'exposed-phpinfo' },
];

function pathOf(f: RawFinding): string {
  try {
    return new URL(f.matchedAt).pathname || '/';
  } catch {
    return f.path ?? '/';
  }
}

export function issueKeyFor(f: RawFinding): string {
  switch (f.scanner) {
    case 'SECORA_CHECKS':
      return f.vulnType;
    case 'DALFOX': {
      const param = String(f.data.param ?? '');
      const kind = String(f.data.kind ?? 'reflected');
      return `xss:${param}:${kind}`;
    }
    case 'NAABU':
      return `open-port:${String(f.data.ip ?? '')}:${String(f.data.port ?? '')}`;
    case 'SUBFINDER':
      return `subdomain:${String(f.data.host ?? f.matchedAt)}`;
    case 'FFUF': {
      const path = pathOf(f);
      return (
        PATH_CLASSES.find((c) => c.pattern.test(path))?.key ??
        `exposed-path:${path}`
      );
    }
    case 'NUCLEI': {
      const id = String(f.data.templateId ?? f.signature).toLowerCase();
      if (NUCLEI_ALIASES[id]) return NUCLEI_ALIASES[id];
      const aliasPrefix = Object.keys(NUCLEI_ALIASES).find((key) =>
        id.startsWith(`${key}-`),
      );
      if (aliasPrefix) return NUCLEI_ALIASES[aliasPrefix];
      // A nuclei hit on a path that ffuf also classifies is the same exposure.
      const byPath = PATH_CLASSES.find((c) => c.pattern.test(pathOf(f)));
      if (
        byPath &&
        f.tags.some((tag) =>
          ['exposure', 'config', 'backup', 'file'].includes(tag),
        )
      )
        return byPath.key;
      return `nuclei:${id}`;
    }
    default:
      return `${f.scanner.toLowerCase()}:${f.signature}`;
  }
}

/// Issue classes that describe a whole origin (headers, TLS, CORS, cookies,
/// disclosure) rather than one path.
function isOriginLevel(issueKey: string): boolean {
  return /^(header-|tls-|cors-|cookie-|disclosure-|http-no-redirect|https-unavailable|headers-summary)/.test(
    issueKey,
  );
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function assetOf(
  issueKey: string,
  f: RawFinding,
): { asset: string; host: string; path: string | null; affected: string } {
  const url = parseUrl(f.matchedAt);
  if (!url) {
    // "host:port" (naabu) or a bare hostname (subfinder).
    const host = f.matchedAt.split(':')[0] || f.matchedAt;
    return { asset: f.matchedAt, host, path: null, affected: f.matchedAt };
  }
  const host = url.host.toLowerCase();
  if (isOriginLevel(issueKey)) {
    // http and https are different origins with different headers.
    return { asset: url.origin, host, path: '/', affected: url.origin };
  }
  const path = (url.pathname || '/').replace(/\/+$/, '') || '/';
  return {
    asset: `${host}${path}`,
    host,
    path,
    affected: `${url.origin}${path === '/' ? '' : path}`,
  };
}

// ---------------------------------------------------------------------------
// De-duplication
// ---------------------------------------------------------------------------

const HEADER_CLASSES = /^header-.*-missing$|^header-clickjacking$/;

export function dedupeFindings(findings: RawFinding[]): MergedFinding[] {
  const groups = new Map<string, MergedFinding>();

  for (const finding of findings) {
    const issueKey = issueKeyFor(finding);
    const where = assetOf(issueKey, finding);
    const key = `${issueKey}|${where.asset}`;
    const existing = groups.get(key);
    if (existing) {
      existing.members.push(finding);
    } else {
      groups.set(key, {
        issueKey,
        ...where,
        severity: finding.severity,
        primary: finding,
        members: [finding],
      });
    }
  }

  const merged = [...groups.values()];

  // nuclei's "missing security headers" is one finding for several headers.
  // Where the native checks already report the individual headers on the same
  // origin, fold it into them (as an extra source) instead of listing it twice.
  const summaries = merged.filter(
    (group) => group.issueKey === 'headers-summary',
  );
  for (const summary of summaries) {
    const headerGroups = merged.filter(
      (group) =>
        HEADER_CLASSES.test(group.issueKey) && group.asset === summary.asset,
    );
    if (headerGroups.length > 0) {
      for (const group of headerGroups) group.members.push(...summary.members);
      merged.splice(merged.indexOf(summary), 1);
    }
  }

  for (const group of merged) {
    group.members.sort(
      (a, b) =>
        SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
        TOOL_PRIORITY.indexOf(a.scanner) - TOOL_PRIORITY.indexOf(b.scanner),
    );
    // Rule 2: the highest severity any source assigned.
    group.severity = group.members.reduce<VulnFindingSeverity>(
      (best, member) =>
        SEVERITY_RANK[member.severity] > SEVERITY_RANK[best]
          ? member.severity
          : best,
      'INFO',
    );
    // The most specific tool among those with that severity leads.
    const top = group.members.filter((m) => m.severity === group.severity);
    group.primary = top.sort(
      (a, b) =>
        TOOL_PRIORITY.indexOf(a.scanner) - TOOL_PRIORITY.indexOf(b.scanner),
    )[0];
  }

  return merged.sort(
    (a, b) =>
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
      a.issueKey.localeCompare(b.issueKey) ||
      a.asset.localeCompare(b.asset),
  );
}

// ---------------------------------------------------------------------------
// Verification and confidence
// ---------------------------------------------------------------------------

const STATUSES: VerificationStatus[] = [
  'REPRODUCED',
  'NOT_REPRODUCED',
  'NOT_APPLICABLE',
  'FAILED',
];

export function verificationOf(
  data: Record<string, unknown>,
): ReportVerificationDto | null {
  const raw = data.verification;
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as Record<string, unknown>;
  const status = STATUSES.find((s) => s === v.status);
  if (!status) return null;
  return {
    status,
    method: typeof v.method === 'string' ? v.method : null,
    checkedAt: typeof v.checkedAt === 'string' ? v.checkedAt : null,
    detail: typeof v.detail === 'string' ? v.detail : null,
  };
}

/// One verdict for a merged finding: reproduced if any source's re-check
/// reproduced it; otherwise the most informative failure.
export function mergedVerification(
  members: RawFinding[],
): ReportVerificationDto {
  const all = members
    .map((m) => verificationOf(m.data))
    .filter((v): v is ReportVerificationDto => v !== null);
  for (const status of STATUSES) {
    const hit = all.find((v) => v.status === status);
    if (hit) return hit;
  }
  return {
    status: 'NOT_APPLICABLE',
    method: null,
    checkedAt: null,
    detail: null,
  };
}

export function reportConfidence(
  severity: VulnFindingSeverity,
  verification: ReportVerificationDto,
): ReportConfidence {
  if (severity === 'INFO') return 'INFO';
  return verification.status === 'REPRODUCED' ? 'CONFIRMED' : 'LIKELY';
}

// ---------------------------------------------------------------------------
// CVEs
// ---------------------------------------------------------------------------

export function extractCves(...texts: (string | null | undefined)[]): string[] {
  const found = new Set<string>();
  for (const text of texts) {
    for (const match of (text ?? '').matchAll(/\bCVE-\d{4}-\d{4,7}\b/gi))
      found.add(match[0].toUpperCase());
  }
  return [...found].sort();
}

// ---------------------------------------------------------------------------
// Score and grade
// ---------------------------------------------------------------------------

/// Points taken off 100 per finding, before the confidence weight.
export const SEVERITY_PENALTY: Record<VulnFindingSeverity, number> = {
  CRITICAL: 25,
  HIGH: 15,
  MEDIUM: 7,
  LOW: 2,
  INFO: 0,
};

/// A re-confirmed finding counts in full; one a tool reported but nothing
/// re-checked counts at 70%.
export const CONFIDENCE_WEIGHT: Record<ReportConfidence, number> = {
  CONFIRMED: 1,
  LIKELY: 0.7,
  INFO: 0,
};

export function computeScore(
  findings: { severity: VulnFindingSeverity; confidence: ReportConfidence }[],
): {
  score: number;
  grade: ReportGrade;
} {
  const penalty = findings.reduce(
    (sum, f) =>
      sum + SEVERITY_PENALTY[f.severity] * CONFIDENCE_WEIGHT[f.confidence],
    0,
  );
  const score = Math.max(0, Math.round(100 - penalty));
  let grade: ReportGrade =
    score >= 90
      ? 'A'
      : score >= 75
        ? 'B'
        : score >= 60
          ? 'C'
          : score >= 40
            ? 'D'
            : 'F';
  // A site with a critical or high issue cannot grade above D or C however many
  // small things are right.
  const worst = findings.reduce(
    (rank, f) =>
      Math.max(rank, f.confidence === 'INFO' ? 0 : SEVERITY_RANK[f.severity]),
    0,
  );
  const order: ReportGrade[] = ['A', 'B', 'C', 'D', 'F'];
  const cap: ReportGrade | null =
    worst >= SEVERITY_RANK.CRITICAL
      ? 'D'
      : worst >= SEVERITY_RANK.HIGH
        ? 'C'
        : null;
  if (cap && order.indexOf(grade) < order.indexOf(cap)) grade = cap;
  return { score, grade };
}
