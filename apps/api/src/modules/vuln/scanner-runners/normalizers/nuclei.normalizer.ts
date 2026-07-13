import { Injectable } from '@nestjs/common';
import { vulnFindingDedupKey } from '../dedup/vuln-dedup-key.util.js';
import {
  mapKeywordsToOwaspCategory,
  mapSeverityString,
} from './owasp-mapping.util.js';
import type { Normalizer, VulnFindingInput } from './normalizer.interface.js';

interface NucleiClassification {
  'cvss-metrics'?: string;
  'cvss-score'?: number;
  'cwe-id'?: string[];
}

interface NucleiInfo {
  name?: string;
  severity?: string;
  description?: string;
  reference?: string[] | string;
  tags?: string[] | string;
  classification?: NucleiClassification;
}

interface NucleiLine {
  'template-id'?: string;
  info?: NucleiInfo;
  host?: string;
  'matched-at'?: string;
  request?: string;
  response?: string;
  'curl-command'?: string;
}

function asStringArray(value: string[] | string | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : value.split(',').map((v) => v.trim());
}

function pathFromUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).pathname || '/';
  } catch {
    return null;
  }
}

/// nuclei -jsonl emits one JSON object per template match — see
/// NucleiScannerRunner. A template match is definitionally exact (the
/// template's matcher logic already decided this is a hit), so every
/// finding gets confidence CONFIRMED; that's what distinguishes Nuclei
/// findings from the content-discovery scanners below, whose "hits" are
/// only ever suggestive.
@Injectable()
export class NucleiNormalizer implements Normalizer {
  normalize(rawOutput: string): VulnFindingInput[] {
    const findings: VulnFindingInput[] = [];
    for (const line of rawOutput.split('\n')) {
      if (!line.trim()) continue;
      let parsed: NucleiLine;
      try {
        parsed = JSON.parse(line) as NucleiLine;
      } catch {
        continue;
      }
      const templateId = parsed['template-id'];
      if (!templateId) continue;

      const info = parsed.info ?? {};
      const tags = asStringArray(info.tags);
      const references = asStringArray(info.reference);
      const matchedAt = parsed['matched-at'] ?? parsed.host ?? '';
      const path = pathFromUrl(matchedAt);
      const cwe = info.classification?.['cwe-id']?.[0] ?? null;
      const vulnType = tags[0] ?? templateId.split('-')[0] ?? 'nuclei-finding';

      findings.push({
        title: info.name ?? templateId,
        description:
          info.description ?? `Nuclei template "${templateId}" matched.`,
        severity: mapSeverityString(info.severity),
        cvssScore: info.classification?.['cvss-score'] ?? null,
        cvssVector: info.classification?.['cvss-metrics'] ?? null,
        cwe,
        owaspCategory: mapKeywordsToOwaspCategory([
          ...tags,
          templateId,
          cwe ?? '',
        ]),
        scannerVersion: null,
        confidence: 'CONFIRMED',
        vulnType,
        path,
        signature: templateId,
        matchedAt,
        data: { templateId, tags, host: parsed.host ?? null },
        dedupKey: vulnFindingDedupKey(path, vulnType, templateId),
        tags,
        references,
        evidence: {
          request: parsed.request,
          response: parsed.response,
          command: parsed['curl-command'],
        },
      });
    }
    return findings;
  }
}
