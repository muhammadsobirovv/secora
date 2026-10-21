import { describe, expect, it } from '@jest/globals';
import { NUCLEI_RECORDED } from '../../pipeline/fixtures/recorded.js';
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

  it('keeps the template remediation in the finding data when present, and omits it otherwise', () => {
    const line = (info: Record<string, unknown>) =>
      JSON.stringify({
        'template-id': 'x-exposure',
        info: { name: 'X', severity: 'low', ...info },
        'matched-at': 'https://example.com/x',
      });
    const [withFix] = normalizer.normalize(line({ remediation: '  Remove the file from the web root.  ' }), {
      scanner: 'NUCLEI',
      targetValue: 'https://example.com',
    });
    expect(withFix.data.remediation).toBe('Remove the file from the web root.');

    for (const info of [{}, { remediation: '   ' }, { remediation: 42 }]) {
      const [without] = normalizer.normalize(line(info), {
        scanner: 'NUCLEI',
        targetValue: 'https://example.com',
      });
      expect(without.data).not.toHaveProperty('remediation');
    }
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

describe('NucleiNormalizer — real recorded output', () => {
  // Output of nuclei v3.11.1 (pinned release) against the local lab target,
  // see pipeline/fixtures/recorded.ts. Hand-written fixtures above can drift
  // from what the tool really prints; this cannot.
  it('turns real nuclei output into confirmed findings with request/response evidence', () => {
    const findings = new NucleiNormalizer().normalize(NUCLEI_RECORDED, {
      scanner: 'NUCLEI',
      targetValue: 'shop.lab.test',
    });

    expect(findings).toHaveLength(4);
    expect(findings.every((f) => f.confidence === 'CONFIRMED')).toBe(true);
    expect(findings.filter((f) => f.severity === 'HIGH')).toHaveLength(3);
    expect(findings.filter((f) => f.severity === 'MEDIUM')).toHaveLength(1);
    expect(findings.map((f) => f.path).sort()).toEqual(['/.env', '/.env', '/.env', '/.git/config']);
    expect(findings.every((f) => Boolean(f.evidence.request) && Boolean(f.evidence.response))).toBe(true);
  });

  it('gives each finding its own dedup key, even when three templates hit the same URL', () => {
    const findings = new NucleiNormalizer().normalize(NUCLEI_RECORDED, {
      scanner: 'NUCLEI',
      targetValue: 'shop.lab.test',
    });
    expect(new Set(findings.map((f) => f.dedupKey)).size).toBe(4);
  });
});
