import { Injectable } from '@nestjs/common';
import { vulnFindingDedupKey } from '../dedup/vuln-dedup-key.util.js';
import type { Normalizer, VulnFindingInput } from './normalizer.interface.js';
import type { VulnFindingSeverity } from '../../../../prisma-types.js';

const SENSITIVE_PATH_PATTERN =
  /admin|config|backup|\.git|\.env|\.svn|wp-admin|phpmyadmin|database|secret|dump|\.sql|api[-_]?key|swagger|actuator|debug|console/i;

/// `[10:20:30] 200 -    1KB - /admin/` or with a redirect target:
/// `[10:20:31] 301 -    0B  - /admin  ->  /admin/`
const LINE_PATTERN =
  /^\[[\d:]+\]\s+(\d{3})\s+-\s+(\S+)\s+-\s+(\S+)(?:\s+->\s+(\S+))?/;

function severityForHit(path: string, status: number): VulnFindingSeverity {
  if (status >= 500) return 'INFO';
  if (SENSITIVE_PATH_PATTERN.test(path)) return 'MEDIUM';
  if (status === 200) return 'LOW';
  return 'INFO';
}

/// Parses dirsearch's default human-readable stdout table — see
/// DirsearchScannerRunner for why no JSON mode is requested.
@Injectable()
export class DirsearchNormalizer implements Normalizer {
  normalize(rawOutput: string): VulnFindingInput[] {
    const findings: VulnFindingInput[] = [];
    for (const line of rawOutput.split('\n')) {
      const match = LINE_PATTERN.exec(line.trim());
      if (!match) continue;
      const status = Number(match[1]);
      const size = match[2];
      const path = match[3];
      const redirectTo = match[4] ?? null;
      if (!Number.isFinite(status)) continue;

      const isRedirect = status === 301 || status === 302 || status === 307;
      const vulnType = isRedirect ? 'exposed-redirect' : 'exposed-content';
      const signature = `dirsearch:${status}`;

      findings.push({
        title: `Discovered path: ${path} (${status})`,
        description: `dirsearch matched ${path} -> HTTP ${status} (${size}).${redirectTo ? ` Redirects to ${redirectTo}.` : ''}`,
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
        matchedAt: path,
        data: { status, size, redirectTo },
        dedupKey: vulnFindingDedupKey(path, vulnType, signature),
        tags: ['content-discovery', 'dirsearch'],
        references: [],
        evidence: {},
      });
    }
    return findings;
  }
}
