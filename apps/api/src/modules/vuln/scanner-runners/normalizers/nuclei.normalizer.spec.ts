import { describe, expect, it } from '@jest/globals';
import { NucleiNormalizer } from './nuclei.normalizer.js';
import type { Normalizer } from './normalizer.interface.js';

// Typed as the `Normalizer` interface — see dirsearch.normalizer.spec.ts's
// identical comment.
const normalizer: Normalizer = new NucleiNormalizer();

describe('NucleiNormalizer', () => {
  it('parses one JSONL match into a CONFIRMED finding with CVSS/CWE/references', () => {
    const raw = JSON.stringify({
      'template-id': 'exposed-panel-admin',
      info: {
        name: 'Exposed Admin Panel',
        severity: 'medium',
        description: 'An administrative panel was found exposed.',
        reference: ['https://example.com/advisory'],
        tags: ['exposure', 'panel'],
        classification: {
          'cvss-metrics': 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N',
          'cvss-score': 5.3,
          'cwe-id': ['CWE-200'],
        },
      },
      host: 'https://example.com',
      'matched-at': 'https://example.com/admin',
      request: 'GET /admin HTTP/1.1',
      response: 'HTTP/1.1 200 OK',
      'curl-command': 'curl https://example.com/admin',
    });

    const [finding] = normalizer.normalize(raw, {
      scanner: 'NUCLEI',
      targetValue: 'https://example.com',
    });

    expect(finding).toMatchObject({
      title: 'Exposed Admin Panel',
      severity: 'MEDIUM',
      cvssScore: 5.3,
      cwe: 'CWE-200',
      confidence: 'CONFIRMED',
      signature: 'exposed-panel-admin',
      path: '/admin',
      vulnType: 'exposure',
    });
    expect(finding.evidence.request).toBe('GET /admin HTTP/1.1');
    expect(finding.evidence.response).toBe('HTTP/1.1 200 OK');
    expect(finding.references).toEqual(['https://example.com/advisory']);
  });

  it('skips lines that are not valid JSON or lack a template-id', () => {
    const raw = [
      'not json',
      JSON.stringify({ info: { name: 'no template id' } }),
    ].join('\n');
    expect(
      normalizer.normalize(raw, {
        scanner: 'NUCLEI',
        targetValue: 'x',
      }),
    ).toEqual([]);
  });

  it('defaults an unrecognized severity string to INFO', () => {
    const raw = JSON.stringify({
      'template-id': 't1',
      info: { severity: 'weird' },
      host: 'https://example.com',
    });
    const [finding] = normalizer.normalize(raw, {
      scanner: 'NUCLEI',
      targetValue: 'x',
    });
    expect(finding.severity).toBe('INFO');
  });
});
