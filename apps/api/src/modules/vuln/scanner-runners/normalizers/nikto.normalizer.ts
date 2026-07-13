import { Injectable } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';
import { vulnFindingDedupKey } from '../dedup/vuln-dedup-key.util.js';
import { mapKeywordsToOwaspCategory } from './owasp-mapping.util.js';
import type { Normalizer, VulnFindingInput } from './normalizer.interface.js';
import type { VulnFindingSeverity } from '../../../../prisma-types.js';

interface NiktoItem {
  '@_id'?: string;
  '@_osvdbid'?: string;
  '@_osvdblink'?: string;
  '@_method'?: string;
  description?: string;
  uri?: string;
  namelink?: string;
}

interface NiktoScanDetails {
  '@_targetip'?: string;
  '@_targethostname'?: string;
  '@_targetport'?: string;
  item?: NiktoItem | NiktoItem[];
}

interface NiktoScan {
  niktoscan?: { scandetails?: NiktoScanDetails | NiktoScanDetails[] };
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => name === 'scandetails' || name === 'item',
});

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/// Nikto's signature checks have no built-in severity — a description
/// keyword heuristic (same style as owasp-mapping.util's category
/// matcher) is the best available signal without a hand-maintained
/// osvdbid -> severity table.
const HIGH_KEYWORDS =
  /shell|backdoor|sql injection|remote code|rce|command execution/i;
const MEDIUM_KEYWORDS =
  /outdated|vulnerable|disclosure|directory listing|default (file|password|credentials)/i;

function severityForDescription(description: string): VulnFindingSeverity {
  if (HIGH_KEYWORDS.test(description)) return 'HIGH';
  if (MEDIUM_KEYWORDS.test(description)) return 'MEDIUM';
  return 'LOW';
}

/// Parses nikto's -Format xml output — see NiktoScannerRunner. Each
/// <item> is one signature-based finding against the scanned host.
@Injectable()
export class NiktoNormalizer implements Normalizer {
  normalize(rawOutput: string): VulnFindingInput[] {
    const findings: VulnFindingInput[] = [];
    let parsed: NiktoScan;
    try {
      parsed = parser.parse(rawOutput) as NiktoScan;
    } catch {
      return findings;
    }

    for (const details of asArray(parsed.niktoscan?.scandetails)) {
      const host = details['@_targethostname'] ?? details['@_targetip'] ?? '';
      const port = details['@_targetport'] ?? '';

      for (const item of asArray(details.item)) {
        const description = item.description ?? 'Nikto finding';
        const path = item.uri ?? '/';
        const osvdbId = item['@_osvdbid'];
        const signature =
          osvdbId && osvdbId !== '0'
            ? `osvdb-${osvdbId}`
            : `nikto-${item['@_id'] ?? path}`;
        const vulnType =
          description.split(/[.:]/)[0]?.trim().slice(0, 80) ||
          'web-misconfiguration';
        const matchedAt = item.namelink || `http://${host}:${port}${path}`;

        findings.push({
          title: description.slice(0, 120),
          description,
          severity: severityForDescription(description),
          cvssScore: null,
          cvssVector: null,
          cwe: null,
          owaspCategory: mapKeywordsToOwaspCategory([description]),
          scannerVersion: null,
          confidence: 'MEDIUM',
          vulnType,
          path,
          signature,
          matchedAt,
          data: {
            host,
            port,
            method: item['@_method'] ?? 'GET',
            osvdbId: osvdbId ?? null,
            osvdbLink: item['@_osvdblink'] || null,
          },
          dedupKey: vulnFindingDedupKey(path, vulnType, signature),
          tags: ['nikto', 'signature-scan'],
          references: item['@_osvdblink'] ? [item['@_osvdblink']] : [],
          evidence: {},
        });
      }
    }
    return findings;
  }
}
