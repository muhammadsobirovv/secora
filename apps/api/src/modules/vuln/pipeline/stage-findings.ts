import type {
  OwaspCategory,
  VulnFindingConfidence,
  VulnFindingSeverity,
} from '../../../prisma-types.js';
import { vulnFindingDedupKey } from '../scanner-runners/dedup/vuln-dedup-key.util.js';
import type { VulnFindingInput } from '../scanner-runners/normalizers/normalizer.interface.js';
import type { DalfoxRecord, FfufRecord, NaabuRecord } from './parsers.js';

/// Turns what the Stage 3 tools reported into findings. Pure functions: the
/// orchestrator has already dropped anything out of scope before calling them.
/// Every finding carries a plain-language fix in data.remediation, which the
/// finding card shows under "How to fix".

export interface FindingDraft {
  title: string;
  description: string;
  severity: VulnFindingSeverity;
  vulnType: string;
  /// Stable id of the check; with the path it decides when two findings are the same.
  signature: string;
  path: string | null;
  matchedAt: string;
  remediation: string;
  confidence?: VulnFindingConfidence;
  cwe?: string | null;
  owaspCategory?: OwaspCategory | null;
  references?: string[];
  tags?: string[];
  data?: Record<string, unknown>;
  evidence?: VulnFindingInput['evidence'];
}

export function makeFinding(draft: FindingDraft): VulnFindingInput {
  return {
    title: draft.title,
    description: draft.description,
    severity: draft.severity,
    cvssScore: null,
    cvssVector: null,
    cwe: draft.cwe ?? null,
    owaspCategory: draft.owaspCategory ?? 'A05_SECURITY_MISCONFIGURATION',
    scannerVersion: null,
    confidence: draft.confidence ?? 'HIGH',
    vulnType: draft.vulnType,
    path: draft.path,
    signature: draft.signature,
    matchedAt: draft.matchedAt,
    data: { ...(draft.data ?? {}), remediation: draft.remediation },
    dedupKey: vulnFindingDedupKey(draft.path, draft.vulnType, draft.signature),
    tags: draft.tags ?? [],
    references: draft.references ?? [],
    evidence: draft.evidence ?? {},
  };
}

// ---------------------------------------------------------------------------
// naabu
// ---------------------------------------------------------------------------

interface PortProfile {
  service: string;
  severity: VulnFindingSeverity;
  remediation: string;
}

const REMOTE_ADMIN =
  'Do not expose remote administration to the internet. Restrict it to a VPN or an allow-list of addresses, and require key-based or multi-factor authentication.';
const DATABASE =
  'Databases and caches should never be reachable from the internet. Bind the service to a private interface, block the port at the firewall, and require authentication.';

const PORT_PROFILES: Record<number, PortProfile> = {
  21: {
    service: 'FTP',
    severity: 'LOW',
    remediation:
      'Replace FTP with SFTP, or restrict the port to the networks that need it.',
  },
  22: {
    service: 'SSH',
    severity: 'INFO',
    remediation:
      'Allow SSH only from trusted addresses, disable password logins and use keys.',
  },
  23: {
    service: 'Telnet',
    severity: 'MEDIUM',
    remediation:
      'Disable Telnet: it sends everything, including passwords, unencrypted. Use SSH.',
  },
  25: {
    service: 'SMTP',
    severity: 'INFO',
    remediation:
      'Make sure the mail server is not an open relay and requires authentication for relaying.',
  },
  110: {
    service: 'POP3',
    severity: 'LOW',
    remediation: 'Offer POP3 only over TLS (port 995).',
  },
  135: {
    service: 'Windows RPC',
    severity: 'MEDIUM',
    remediation:
      'Block Windows RPC at the firewall; it should never face the internet.',
  },
  139: {
    service: 'NetBIOS',
    severity: 'MEDIUM',
    remediation: 'Block NetBIOS at the firewall.',
  },
  143: {
    service: 'IMAP',
    severity: 'LOW',
    remediation: 'Offer IMAP only over TLS (port 993).',
  },
  445: {
    service: 'SMB',
    severity: 'MEDIUM',
    remediation:
      'Block SMB at the firewall; file sharing should never face the internet.',
  },
  1433: {
    service: 'Microsoft SQL Server',
    severity: 'MEDIUM',
    remediation: DATABASE,
  },
  2375: {
    service: 'Docker API (unencrypted)',
    severity: 'HIGH',
    remediation:
      'The unencrypted Docker API gives full control of the host. Close the port, or protect it with mutual TLS.',
  },
  3306: { service: 'MySQL', severity: 'MEDIUM', remediation: DATABASE },
  3389: {
    service: 'Remote Desktop',
    severity: 'MEDIUM',
    remediation: REMOTE_ADMIN,
  },
  5432: { service: 'PostgreSQL', severity: 'MEDIUM', remediation: DATABASE },
  5900: { service: 'VNC', severity: 'MEDIUM', remediation: REMOTE_ADMIN },
  5984: { service: 'CouchDB', severity: 'MEDIUM', remediation: DATABASE },
  6379: { service: 'Redis', severity: 'MEDIUM', remediation: DATABASE },
  9200: { service: 'Elasticsearch', severity: 'MEDIUM', remediation: DATABASE },
  11211: { service: 'Memcached', severity: 'MEDIUM', remediation: DATABASE },
  27017: { service: 'MongoDB', severity: 'MEDIUM', remediation: DATABASE },
};

const WEB_PORTS = new Set([80, 443, 8080, 8443]);

/// One finding per open port. `hostsByIp` maps each scanned address back to the
/// hostname it was resolved from. Web ports are expected, so they stay INFO.
export function normalizeNaabu(
  records: NaabuRecord[],
  hostsByIp: ReadonlyMap<string, string>,
): VulnFindingInput[] {
  return records.map((record) => {
    const host = hostsByIp.get(record.ip) ?? record.ip;
    const profile = PORT_PROFILES[record.port];
    const service =
      profile?.service ??
      (WEB_PORTS.has(record.port) ? 'web' : 'unknown service');
    const severity = profile?.severity ?? 'INFO';
    return makeFinding({
      title: `Open port ${record.port}/${record.protocol} (${service}) on ${host}`,
      description: `A TCP connection to port ${record.port} on ${host} (${record.ip}) succeeded, so a service is listening there and reachable from the internet.`,
      severity,
      vulnType: 'open-port',
      signature: `naabu:${record.ip}:${record.port}`,
      path: null,
      matchedAt: `${host}:${record.port}`,
      remediation:
        profile?.remediation ??
        'If this service is not meant to be public, close the port or restrict it to trusted addresses. If it is, keep it patched and make sure it requires authentication.',
      confidence: 'CONFIRMED',
      owaspCategory: 'A05_SECURITY_MISCONFIGURATION',
      tags: ['port', 'network'],
      data: {
        host,
        ip: record.ip,
        port: record.port,
        protocol: record.protocol,
        service,
      },
    });
  });
}

// ---------------------------------------------------------------------------
// ffuf
// ---------------------------------------------------------------------------

interface PathRule {
  pattern: RegExp;
  severity: VulnFindingSeverity;
  what: string;
  remediation: string;
}

/// Checked in order; the first match decides. Applies to a response that was
/// actually served (200-class). Paths that answer 401/403 exist but are
/// protected, which is the right behaviour, so those stay INFO.
const PATH_RULES: PathRule[] = [
  {
    pattern: /(^|\/)\.git(\/|$)/i,
    severity: 'HIGH',
    what: 'a Git repository',
    remediation:
      'Remove the .git directory from the web root (or deny access to it in the web server). Anyone who can read it can download the full source code and history.',
  },
  {
    pattern: /(^|\/)\.svn(\/|$)/i,
    severity: 'HIGH',
    what: 'a Subversion repository',
    remediation:
      'Remove the .svn directory from the web root or deny access to it.',
  },
  {
    pattern: /(^|\/)\.env($|\.)/i,
    severity: 'HIGH',
    what: 'an environment file',
    remediation:
      'Remove the file from the web root and rotate every secret it contains: assume they are exposed.',
  },
  {
    pattern: /(^|\/)(\.htpasswd|id_rsa|\.npmrc|wp-config\.php\.bak)$/i,
    severity: 'HIGH',
    what: 'a credentials file',
    remediation:
      'Remove the file from the web root and rotate every credential it contains.',
  },
  {
    pattern: /\.(sql|bak|zip|tar\.gz|tgz|gz)$/i,
    severity: 'HIGH',
    what: 'a backup or database dump',
    remediation:
      'Move backups out of the web root. If the file was reachable, treat its contents as leaked.',
  },
  {
    pattern: /(^|\/)(phpinfo|info)\.php$/i,
    severity: 'MEDIUM',
    what: 'a PHP information page',
    remediation:
      'Delete the page. It reveals the server configuration, paths and installed modules.',
  },
  {
    pattern:
      /(^|\/)(actuator|jmx-console|server-status|server-info|elmah\.axd|trace\.axd|console|debug)(\/|$)/i,
    severity: 'MEDIUM',
    what: 'a diagnostics or management endpoint',
    remediation:
      'Disable the endpoint in production, or restrict it to an internal network or authenticated administrators.',
  },
  {
    pattern: /(^|\/)(metrics|prometheus)(\/|$)/i,
    severity: 'MEDIUM',
    what: 'a metrics endpoint',
    remediation:
      'Do not publish metrics to the internet. Restrict the endpoint to the monitoring system.',
  },
  {
    pattern:
      /(^|\/)(phpmyadmin|pma|adminer\.php|manager\/html|jenkins|solr|kibana|grafana)(\/|$)/i,
    severity: 'MEDIUM',
    what: 'an administration interface',
    remediation:
      'Restrict the interface to a VPN or an allow-list of addresses and require strong authentication.',
  },
  {
    pattern: /(^|\/)(admin|administrator|login|dashboard)(\/|$)/i,
    severity: 'LOW',
    what: 'a login or administration page',
    remediation:
      'Make sure the page requires strong authentication (and multi-factor where possible); restrict it to trusted addresses if it is internal.',
  },
  {
    pattern:
      /(^|\/)(swagger(-ui)?(\.json)?|openapi\.json|api-docs|graphql)(\/|$)/i,
    severity: 'LOW',
    what: 'API documentation or a GraphQL endpoint',
    remediation:
      'Publish API documentation only if it is meant to be public; disable GraphQL introspection in production.',
  },
  {
    pattern:
      /(^|\/)(package\.json|composer\.json|composer\.lock|yarn\.lock|dockerfile|docker-compose\.yml|\.gitignore|web\.config|config\.(json|php|yml))$/i,
    severity: 'LOW',
    what: 'a project or configuration file',
    remediation:
      'Remove build and configuration files from the web root; they reveal dependencies and internals.',
  },
  {
    pattern:
      /(^|\/)(ftp|uploads?|files|logs?|tmp|temp|old|private|internal|secrets?|staging|dev)(\/|$)/i,
    severity: 'LOW',
    what: 'a directory that is normally not public',
    remediation:
      'Check what the directory exposes. Disable directory listing and remove files that should not be public.',
  },
];

const QUIET_PATHS =
  /(^|\/)(robots\.txt|sitemap\.xml|crossdomain\.xml|security\.txt|\.well-known\/security\.txt|assets|static)$/i;

/// One finding per path the content discovery reached. `host` is the verified
/// hostname (the URLs ffuf prints already use it, since it ran through the proxy).
export function normalizeFfuf(records: FfufRecord[]): VulnFindingInput[] {
  const findings: VulnFindingInput[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    let path: string;
    try {
      const parsed = new URL(record.url);
      path = parsed.pathname;
    } catch {
      continue;
    }
    if (seen.has(path)) continue;
    seen.add(path);

    const served = record.status >= 200 && record.status < 300;
    const protectedPath = record.status === 401 || record.status === 403;
    const redirect = record.status >= 300 && record.status < 400;
    const rule = PATH_RULES.find((candidate) => candidate.pattern.test(path));
    const quiet = QUIET_PATHS.test(path);

    let severity: VulnFindingSeverity = 'INFO';
    let what = 'a path';
    let remediation = 'Confirm this path is meant to be public.';
    if (rule && served) {
      severity = rule.severity;
      what = rule.what;
      remediation = rule.remediation;
    } else if (rule && (protectedPath || redirect)) {
      what = rule.what;
      remediation =
        'The path is protected or redirected, which is the right behaviour; keep it that way.';
    } else if (quiet) {
      remediation = 'Nothing to fix; the file is expected to be public.';
    }

    const state = served
      ? 'is reachable'
      : protectedPath
        ? `exists but answers ${record.status} (protected)`
        : redirect
          ? `redirects${record.redirectLocation ? ` to ${record.redirectLocation}` : ''} (not followed)`
          : `answers ${record.status}`;
    findings.push(
      makeFinding({
        title: `Content discovery: ${path} (${record.status})`,
        description: `Content discovery found ${what} at ${path}; it ${state}. Response: ${record.status}, ${record.length} bytes${record.contentType ? `, ${record.contentType}` : ''}.`,
        severity,
        vulnType: 'exposed-content',
        signature: `ffuf:${path}`,
        path,
        matchedAt: record.url,
        remediation,
        confidence: served ? 'HIGH' : 'MEDIUM',
        owaspCategory:
          severity === 'INFO'
            ? 'A05_SECURITY_MISCONFIGURATION'
            : 'A01_BROKEN_ACCESS_CONTROL',
        cwe: severity === 'INFO' ? null : 'CWE-538',
        tags: ['content-discovery'],
        data: {
          status: record.status,
          length: record.length,
          words: record.words,
          lines: record.lines,
        },
        evidence: {
          request: `GET ${path} HTTP/1.1
Host: ${new URL(record.url).host}`,
          response: `HTTP ${record.status}${
            record.contentType
              ? `
content-type: ${record.contentType}`
              : ''
          }
content-length: ${record.length}`,
        },
      }),
    );
  }
  return findings;
}

// ---------------------------------------------------------------------------
// dalfox
// ---------------------------------------------------------------------------

function severityOf(record: DalfoxRecord): VulnFindingSeverity {
  switch (record.severity?.toLowerCase()) {
    case 'critical':
      return 'CRITICAL';
    case 'high':
      return 'HIGH';
    case 'medium':
      return 'MEDIUM';
    case 'low':
      return 'LOW';
    case 'info':
      return 'INFO';
    default:
      return record.type === 'V'
        ? 'HIGH'
        : record.type === 'I'
          ? 'INFO'
          : 'MEDIUM';
  }
}

const DALFOX_FIX =
  "Encode untrusted input for the place it is written into (HTML body, attribute, JavaScript, URL) using your framework's output encoding, never by building HTML from strings. Add a Content-Security-Policy that blocks inline scripts as a second layer.";

/// One finding per (parameter, kind) dalfox reported. dalfox sends detection
/// payloads only (no blind callbacks, no custom or remote payloads).
export function normalizeDalfox(records: DalfoxRecord[]): VulnFindingInput[] {
  const findings: VulnFindingInput[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    let path: string;
    let origin: string;
    try {
      const parsed = new URL(record.url);
      path = parsed.pathname;
      origin = parsed.origin;
    } catch {
      continue;
    }
    const kind =
      record.type === 'A'
        ? 'dom'
        : record.type === 'V'
          ? 'verified'
          : 'reflected';
    const key = `${path}:${record.param}:${kind}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const label =
      kind === 'dom'
        ? 'DOM-based XSS (static analysis)'
        : kind === 'verified'
          ? 'Cross-site scripting (verified)'
          : 'Reflected input (possible XSS)';
    findings.push(
      makeFinding({
        title: `${label} in parameter "${record.param}"`,
        description: `The ${record.method} parameter "${record.param}" on ${path} ${
          kind === 'reflected'
            ? 'is reflected in the page without enough encoding'
            : 'executes injected script'
        }${record.evidence ? `. ${record.evidence}` : '.'}`,
        severity: severityOf(record),
        vulnType: 'xss',
        signature: `dalfox:${record.param}:${kind}`,
        path,
        matchedAt: `${origin}${path}`,
        remediation: DALFOX_FIX,
        confidence:
          record.type === 'V'
            ? 'CONFIRMED'
            : record.confidence?.toLowerCase() === 'high'
              ? 'HIGH'
              : 'MEDIUM',
        cwe: record.cwe ?? 'CWE-79',
        owaspCategory: 'A03_INJECTION',
        references: [
          'https://owasp.org/www-community/attacks/xss/',
          'https://cwe.mitre.org/data/definitions/79.html',
        ],
        tags: ['xss', 'dalfox'],
        data: {
          param: record.param,
          method: record.method,
          injectType: record.injectType,
          kind,
          url: record.url,
        },
        evidence: {
          request: record.request ?? undefined,
          payload: record.payload || undefined,
        },
      }),
    );
  }
  return findings;
}

// ---------------------------------------------------------------------------
// subfinder + dnsx
// ---------------------------------------------------------------------------

export interface ResolvedSubdomain {
  host: string;
  addresses: string[];
}

/// One INFO finding per subdomain that is in scope and resolves only to public
/// addresses. It is an inventory entry, not a vulnerability.
export function normalizeSubdomains(
  subdomains: ResolvedSubdomain[],
): VulnFindingInput[] {
  return subdomains.map((subdomain) =>
    makeFinding({
      title: `Subdomain discovered: ${subdomain.host}`,
      description: `${subdomain.host} was found in public data sources and resolves to ${subdomain.addresses.join(', ')}.`,
      severity: 'INFO',
      vulnType: 'subdomain',
      signature: `subfinder:${subdomain.host}`,
      path: null,
      matchedAt: subdomain.host,
      remediation:
        'Check that every subdomain is intended to be public. Delete DNS records for services you no longer run: a record that points at a deleted cloud resource can be taken over by someone else.',
      confidence: 'CONFIRMED',
      owaspCategory: 'A05_SECURITY_MISCONFIGURATION',
      tags: ['subdomain', 'inventory'],
      data: { host: subdomain.host, addresses: subdomain.addresses },
    }),
  );
}
