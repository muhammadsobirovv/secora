import { Injectable } from '@nestjs/common';
import { vulnFindingDedupKey } from '../dedup/vuln-dedup-key.util.js';
import type { Normalizer, VulnFindingInput } from './normalizer.interface.js';
import type { VulnFindingSeverity } from '../../../../prisma-types.js';

const SENSITIVE_PATH_PATTERN =
  /admin|config|backup|\.git|\.env|\.svn|wp-admin|phpmyadmin|database|secret|dump|\.sql|api[-_]?key|swagger|actuator|debug|console/i;

interface FeroxbusterLine {
  type?: string;
  url?: string;
  path?: string;
  status?: number;
  content_length?: number;
  word_count?: number;
  line_count?: number;
  method?: string;
}

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

/// feroxbuster --json emits one ND-JSON object per line; only
/// `"type":"response"` lines are discovered-path hits (other types are
/// scan lifecycle/statistics events, filtered out here).
@Injectable()
export class FeroxbusterNormalizer implements Normalizer {
  normalize(rawOutput: string): VulnFindingInput[] {
    const findings: VulnFindingInput[] = [];
    for (const line of rawOutput.split('\n')) {
      if (!line.trim()) continue;
      let parsed: FeroxbusterLine;
      try {
        parsed = JSON.parse(line) as FeroxbusterLine;
      } catch {
        continue;
      }
      if (parsed.type !== 'response') continue;
      const status = parsed.status ?? 0;
      if (status === 0) continue;

      const path = pathFromUrl(parsed.url) ?? parsed.path ?? '/';
      const isRedirect = status === 301 || status === 302 || status === 307;
      const vulnType = isRedirect ? 'exposed-redirect' : 'exposed-content';
      const signature = `feroxbuster:${status}`;

      findings.push({
        title: `Discovered path: ${path} (${status})`,
        description: `feroxbuster matched ${path} -> HTTP ${status} (${parsed.content_length ?? '?'} bytes).`,
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
        matchedAt: parsed.url ?? path,
        data: {
          status,
          contentLength: parsed.content_length ?? null,
          wordCount: parsed.word_count ?? null,
          lineCount: parsed.line_count ?? null,
          method: parsed.method ?? 'GET',
        },
        dedupKey: vulnFindingDedupKey(path, vulnType, signature),
        tags: ['content-discovery', 'feroxbuster'],
        references: [],
        evidence: {},
      });
    }
    return findings;
  }
}
