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
