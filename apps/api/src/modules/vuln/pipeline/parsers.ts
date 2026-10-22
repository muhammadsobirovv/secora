/// Output parsers for the catalog tools. Pure functions over stdout text, so
/// they are tested against recorded fixtures without running any binary.
/// Each returns only the fields the platform stores; unknown fields are ignored
/// and a malformed line is skipped (never throws), because a tool that prints
/// one bad line must not lose the other findings.

export interface HttpxRecord {
  url: string;
  statusCode: number | null;
  title: string | null;
  webServer: string | null;
  technologies: string[];
  /// Redirect target (Location) when the answer was a 3xx. httpx does not
  /// follow it; the pipeline only logs it, or drops it when out of scope.
  location: string | null;
  /// The address httpx actually connected to.
  hostIp: string | null;
}

export function parseHttpxJsonl(stdout: string): HttpxRecord[] {
  const records: HttpxRecord[] = [];
  for (const line of stdout.split('\n')) {
    const text = line.trim();
    if (!text.startsWith('{')) continue;
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(text) as Record<string, unknown>;
    } catch {
      continue;
    }
    const url = typeof raw.url === 'string' ? raw.url : null;
    if (!url) continue;
    records.push({
      url,
      statusCode: typeof raw.status_code === 'number' ? raw.status_code : null,
      title: typeof raw.title === 'string' && raw.title ? raw.title : null,
      webServer: typeof raw.webserver === 'string' && raw.webserver ? raw.webserver : null,
      technologies: Array.isArray(raw.tech)
        ? raw.tech.filter((t): t is string => typeof t === 'string')
        : [],
      location: typeof raw.location === 'string' && raw.location ? raw.location : null,
      hostIp: typeof raw.host_ip === 'string' && raw.host_ip ? raw.host_ip : null,
    });
  }
  return records;
}

export interface NucleiMatch {
  templateId: string;
  name: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical' | 'unknown';
  matchedAt: string;
}

const SEVERITIES = new Set(['info', 'low', 'medium', 'high', 'critical']);

export function parseNucleiJsonl(stdout: string): NucleiMatch[] {
  const matches: NucleiMatch[] = [];
  for (const line of stdout.split('\n')) {
    const text = line.trim();
    if (!text.startsWith('{')) continue;
    let raw: {
      'template-id'?: unknown;
      'matched-at'?: unknown;
      host?: unknown;
      info?: { name?: unknown; severity?: unknown };
    };
    try {
      raw = JSON.parse(text);
    } catch {
      continue;
    }
    if (typeof raw['template-id'] !== 'string') continue;
    const severity = typeof raw.info?.severity === 'string' ? raw.info.severity.toLowerCase() : 'unknown';
    matches.push({
      templateId: raw['template-id'],
      name: typeof raw.info?.name === 'string' ? raw.info.name : raw['template-id'],
      severity: (SEVERITIES.has(severity) ? severity : 'unknown') as NucleiMatch['severity'],
      matchedAt:
        typeof raw['matched-at'] === 'string'
          ? raw['matched-at']
          : typeof raw.host === 'string'
            ? raw.host
            : '',
    });
  }
  return matches;
}

// ---------------------------------------------------------------------------
// Stage 3 tools. Same rules as above: pure functions over stdout, tested with
// output recorded from the pinned binaries (fixtures/recorded-stage3.ts), a
// malformed line is skipped and never throws.
// ---------------------------------------------------------------------------

function jsonLines(stdout: string): Record<string, unknown>[] {
  const result: Record<string, unknown>[] = [];
  for (const line of stdout.split('\n')) {
    const text = line.trim();
    if (!text.startsWith('{')) continue;
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed && typeof parsed === 'object') result.push(parsed as Record<string, unknown>);
    } catch {
      // Not JSON (a banner or a truncated last line): ignore.
    }
  }
  return result;
}

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;
const asStrings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v !== '') : [];

export interface KatanaRecord {
  url: string;
  method: string;
  statusCode: number | null;
}

/// katana -jsonl: one object per request, `request.endpoint` is the URL.
export function parseKatanaJsonl(stdout: string): KatanaRecord[] {
  const records: KatanaRecord[] = [];
  for (const raw of jsonLines(stdout)) {
    const request = (raw.request ?? {}) as Record<string, unknown>;
    const response = (raw.response ?? {}) as Record<string, unknown>;
    const url = asString(request.endpoint);
    if (!url) continue;
    records.push({
      url,
      method: asString(request.method) ?? 'GET',
      statusCode: typeof response.status_code === 'number' ? response.status_code : null,
    });
  }
  return records;
}

/// subfinder -silent: one hostname per line. Anything that does not look like a
/// hostname (a log line, a banner) is dropped.
export function parseSubfinderLines(stdout: string): string[] {
  const hosts = new Set<string>();
  for (const line of stdout.split('\n')) {
    const text = line.trim().toLowerCase();
    if (/^(?=.{1,253}$)([a-z0-9_*-]+\.)+[a-z]{2,63}$/.test(text) && !text.startsWith('*.')) {
      hosts.add(text);
    }
  }
  return [...hosts];
}

export interface DnsxRecord {
  host: string;
  a: string[];
  aaaa: string[];
  /// dnsx's own flag that at least one answer is a private/internal address.
  hasInternalIps: boolean;
  status: string | null;
}

export function parseDnsxJsonl(stdout: string): DnsxRecord[] {
  const records: DnsxRecord[] = [];
  for (const raw of jsonLines(stdout)) {
    const host = asString(raw.host);
    if (!host) continue;
    records.push({
      host: host.toLowerCase(),
      a: asStrings(raw.a),
      aaaa: asStrings(raw.aaaa),
      hasInternalIps: raw.has_internal_ips === true,
      status: asString(raw.status_code),
    });
  }
  return records;
}

export interface NaabuRecord {
  ip: string;
  port: number;
  protocol: string;
}

/// naabu -json. The same open port is printed more than once; each (ip, port)
/// appears once in the result.
export function parseNaabuJsonl(stdout: string): NaabuRecord[] {
  const seen = new Set<string>();
  const records: NaabuRecord[] = [];
  for (const raw of jsonLines(stdout)) {
    const ip = asString(raw.ip);
    const port = typeof raw.port === 'number' ? raw.port : null;
    if (!ip || port === null || port < 1 || port > 65535) continue;
    const key = `${ip}:${port}`;
    if (seen.has(key)) continue;
    seen.add(key);
    records.push({ ip, port, protocol: asString(raw.protocol) ?? 'tcp' });
  }
  return records;
}

export interface FfufRecord {
  url: string;
  status: number;
  length: number;
  words: number;
  lines: number;
  contentType: string | null;
  redirectLocation: string | null;
}

/// ffuf -json: one object per match (the FUZZ input is base64 and unused: the
/// URL already carries the path).
export function parseFfufJsonl(stdout: string): FfufRecord[] {
  const records: FfufRecord[] = [];
  for (const raw of jsonLines(stdout)) {
    const url = asString(raw.url);
    const status = typeof raw.status === 'number' ? raw.status : null;
    if (!url || status === null) continue;
    records.push({
      url,
      status,
      length: typeof raw.length === 'number' ? raw.length : 0,
      words: typeof raw.words === 'number' ? raw.words : 0,
      lines: typeof raw.lines === 'number' ? raw.lines : 0,
      contentType: asString(raw['content-type']),
      redirectLocation: asString(raw.redirectlocation),
    });
  }
  return records;
}

export interface DalfoxRecord {
  /// "V" verified, "R" reflected, "A" DOM (AST) finding, "I" informational.
  type: string;
  severity: string | null;
  confidence: string | null;
  method: string;
  param: string;
  payload: string;
  /// The URL that triggered it.
  url: string;
  evidence: string | null;
  request: string | null;
  cwe: string | null;
  injectType: string | null;
}

/// dalfox --format jsonl: a `meta` object, then one object per finding.
export function parseDalfoxJsonl(stdout: string): DalfoxRecord[] {
  const records: DalfoxRecord[] = [];
  for (const raw of jsonLines(stdout)) {
    if (raw.meta) continue;
    const type = asString(raw.type);
    const url = asString(raw.data);
    const param = asString(raw.param);
    if (!type || !url || !param) continue;
    records.push({
      type,
      severity: asString(raw.severity),
      confidence: asString(raw.confidence),
      method: asString(raw.method) ?? 'GET',
      param,
      payload: asString(raw.payload) ?? '',
      url,
      evidence: asString(raw.evidence),
      request: asString(raw.request),
      cwe: asString(raw.cwe),
      injectType: asString(raw.inject_type),
    });
  }
  return records;
}
