import { Injectable } from '@nestjs/common';
import { vulnFindingDedupKey } from '../dedup/vuln-dedup-key.util.js';
import type { Normalizer, VulnFindingInput } from './normalizer.interface.js';
import type { VulnFindingSeverity } from '../../../../prisma-types.js';

interface FfufResult {
  input?: Record<string, string>;
  status?: number;
  length?: number;
  words?: number;
  lines?: number;
  'content-type'?: string;
  redirectlocation?: string;
  url?: string;
  host?: string;
}

interface FfufOutput {
  results?: FfufResult[];
}

/// Paths matching these are worth flagging above the baseline "a path
/// exists" INFO/LOW — same heuristic role DirsearchNormalizer and
/// FeroxbusterNormalizer each apply independently (content-discovery
/// scanners share no code, but the "sensitive path" judgment call is the
/// same one every time, so the pattern itself is duplicated deliberately —
/// see docs/adr/0004, "why five small normalizers instead of one shared
/// content-discovery normalizer").
const SENSITIVE_PATH_PATTERN =
  /admin|config|backup|\.git|\.env|\.svn|wp-admin|phpmyadmin|database|secret|dump|\.sql|api[-_]?key|swagger|actuator|debug|console/i;

function severityForHit(path: string, status: number): VulnFindingSeverity {
  if (status >= 500) return 'INFO';
  if (SENSITIVE_PATH_PATTERN.test(path)) return 'MEDIUM';
  if (status === 200) return 'LOW';
  return 'INFO';
}

function pathFromUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).pathname || '/';
  } catch {
    return value;
  }
}

/// ffuf's -of json writes one document `{"results": [...]}` at process
/// exit — see FfufScannerRunner for why that's still readable from the
/// same buffered stdout every other adapter reads.
@Injectable()
export class FfufNormalizer implements Normalizer {
  normalize(rawOutput: string): VulnFindingInput[] {
    let parsed: FfufOutput;
    try {
      parsed = JSON.parse(rawOutput) as FfufOutput;
    } catch {
      return [];
    }

    const findings: VulnFindingInput[] = [];
    for (const result of parsed.results ?? []) {
      const status = result.status ?? 0;
      if (status === 0) continue;
      const path = pathFromUrl(result.url) ?? '/';
      const isRedirect = status === 301 || status === 302 || status === 307;
      const vulnType = isRedirect ? 'exposed-redirect' : 'exposed-content';
      const signature = `ffuf:${status}`;
      const fuzzValue = result.input?.FUZZ ?? path;

      findings.push({
        title: `Discovered path: ${path} (${status})`,
        description: `ffuf matched "${fuzzValue}" -> HTTP ${status} (${result.length ?? '?'} bytes, content-type ${result['content-type'] ?? 'unknown'}).`,
        severity: severityForHit(path, status),
        cvssScore: null,
        cvssVector: null,
        cwe: null,
        owaspCategory: SENSITIVE_PATH_PATTERN.test(path)
          ? 'A05_SECURITY_MISCONFIGURATION'
          : 'UNKNOWN',
        scannerVersion: null,
        confidence: 'MEDIUM',
        vulnType,
        path,
        signature,
        matchedAt: result.url ?? path,
        data: {
          status,
          length: result.length ?? null,
          words: result.words ?? null,
          lines: result.lines ?? null,
          contentType: result['content-type'] ?? null,
          redirectLocation: result.redirectlocation || null,
        },
        dedupKey: vulnFindingDedupKey(path, vulnType, signature),
        tags: ['content-discovery', 'ffuf'],
        references: [],
        evidence: {},
      });
    }
    return findings;
  }
}
