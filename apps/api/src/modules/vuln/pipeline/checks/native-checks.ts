import type { VulnScanJobLogLevel } from '../../../../prisma-types.js';
import type { VulnFindingInput } from '../../scanner-runners/normalizers/normalizer.interface.js';
import type { PinnedHost } from '../pin.util.js';
import { makeFinding, type FindingDraft } from '../stage-findings.js';
import {
  analyzeCookies,
  analyzeCors,
  analyzeDisclosure,
  analyzeHeaders,
  analyzeHttpToHttps,
  analyzeTls,
  CORS_PROBE_ORIGIN,
} from './analyzers.js';
import {
  pinnedGet,
  tlsProbe,
  type PinnedGet,
  type PinnedResponse,
  type TlsProbe,
} from './pinned-io.js';

/// The QUICK profile: TLS, security headers, cookie flags, CORS and version
/// disclosure, in plain TypeScript with no external binary. Every request goes
/// to the host's pinned address (see pinned-io.ts), is a plain GET for "/" (plus
/// one with a made-up Origin for CORS), and never follows a redirect.
///
/// What it can and cannot tell you: it judges what the server sends for the
/// home page of each origin. It does not log in, so headers or cookies that
/// only appear on authenticated pages are not seen, and it does not prove that
/// a missing header is exploitable: those findings are hardening advice.

export interface NativeChecksInput {
  pin: PinnedHost;
  /// Web origins to check, e.g. "https://shop.example.org". At most four are used.
  origins: string[];
  signal: AbortSignal;
  onLog: (level: VulnScanJobLogLevel, message: string) => void;
}

export interface NativeChecksResult {
  findings: VulnFindingInput[];
  /// Origins that answered.
  reachable: string[];
  /// Human-readable record of what was observed, kept as the raw-output evidence.
  raw: string;
}

const MAX_ORIGINS = 4;

export interface NativeChecksDeps {
  get?: PinnedGet;
  tls?: TlsProbe;
  now?: () => Date;
}

export class NativeChecks {
  private readonly get: PinnedGet;
  private readonly tls: TlsProbe;
  private readonly now: () => Date;

  constructor(deps: NativeChecksDeps = {}) {
    this.get = deps.get ?? pinnedGet;
    this.tls = deps.tls ?? tlsProbe;
    this.now = deps.now ?? (() => new Date());
  }

  async run(input: NativeChecksInput): Promise<NativeChecksResult> {
    const { pin, onLog, signal } = input;
    const drafts: FindingDraft[] = [];
    const reachable: string[] = [];
    const raw: string[] = [];
    const responses = new Map<string, PinnedResponse>();

    const origins = [...new Set(input.origins)].slice(0, MAX_ORIGINS);
    for (const origin of origins) {
      if (signal.aborted) break;
      const url = new URL(origin);
      const scheme = url.protocol === 'https:' ? 'https' : 'http';
      const port = url.port ? Number(url.port) : scheme === 'https' ? 443 : 80;
      const where = { origin: url.origin };

      let response: PinnedResponse;
      try {
        response = await this.get({ pin, scheme, port, path: '/', signal });
      } catch (error) {
        onLog(
          'WARN',
          `Checks: ${url.origin} did not answer (${(error as Error).message}).`,
        );
        raw.push(`${url.origin}: no answer (${(error as Error).message})`);
        continue;
      }
      reachable.push(url.origin);
      responses.set(url.origin, response);
      onLog('INFO', `Checks: ${url.origin} answered ${response.status}.`);
      raw.push(`${url.origin}: HTTP ${response.status}`);
      for (const [name, value] of Object.entries(response.headers))
        raw.push(`  ${name}: ${value}`);

      if (scheme === 'https') {
        try {
          const info = await this.tls({ pin, port, signal });
          raw.push(
            `  tls: ${info.protocol ?? '?'} ${info.cipher ?? ''}, cert ${info.subject ?? '?'} until ${info.validTo ?? '?'}`,
          );
          drafts.push(...analyzeTls(info, where, this.now()));
        } catch (error) {
          onLog(
            'WARN',
            `Checks: TLS inspection of ${url.origin} failed (${(error as Error).message}).`,
          );
        }
      }
      // A redirect (typically http -> https) is not a page: hardening headers
      // belong on the page it points to, so they are not demanded here.
      const isRedirect = response.status >= 300 && response.status < 400;
      drafts.push(
        ...(isRedirect ? [] : analyzeHeaders(response, where)),
        ...analyzeDisclosure(response, where),
        ...analyzeCookies(response, where),
      );

      for (const sentOrigin of isRedirect ? [] : [CORS_PROBE_ORIGIN, 'null']) {
        if (signal.aborted) break;
        try {
          const cors = await this.get({
            pin,
            scheme,
            port,
            path: '/',
            headers: { origin: sentOrigin },
            signal,
          });
          drafts.push(...analyzeCors(cors, where, sentOrigin));
        } catch {
          // The plain request already worked; a failed CORS probe adds nothing.
        }
      }
    }

    const httpsOrigin = reachable.find((origin) =>
      origin.startsWith('https://'),
    );
    for (const origin of reachable.filter((candidate) =>
      candidate.startsWith('http://'),
    )) {
      const response = responses.get(origin);
      if (httpsOrigin && response) {
        drafts.push(...analyzeHttpToHttps(response, { origin }, httpsOrigin));
      }
    }
    if (!httpsOrigin && reachable.length > 0) {
      const origin = reachable[0];
      drafts.push({
        title: 'Site is not available over HTTPS',
        description: `${origin} answers over plain HTTP and no HTTPS service answered on the same host, so everything a visitor sends or receives can be read or changed on the network.`,
        severity: 'MEDIUM',
        vulnType: 'https-unavailable',
        signature: `secora-check:https-unavailable@${origin}`,
        path: '/',
        matchedAt: origin,
        remediation:
          "Obtain a certificate (Let's Encrypt is free), serve the site over HTTPS, redirect HTTP to HTTPS and send Strict-Transport-Security.",
        confidence: 'HIGH',
        cwe: 'CWE-319',
        owaspCategory: 'A02_CRYPTOGRAPHIC_FAILURES',
        tags: ['secora-check', 'tls'],
      });
    }

    const seen = new Set<string>();
    const findings: VulnFindingInput[] = [];
    for (const item of drafts) {
      if (seen.has(item.signature)) continue;
      seen.add(item.signature);
      findings.push(makeFinding(item));
    }
    return { findings, reachable, raw: raw.join('\n') };
  }
}
