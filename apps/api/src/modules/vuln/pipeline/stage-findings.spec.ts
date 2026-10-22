import { describe, expect, it } from '@jest/globals';
import {
  DALFOX_RECORDED_VULNERABLE,
  FFUF_RECORDED,
  NAABU_RECORDED,
} from './fixtures/recorded-stage3.js';
import {
  parseDalfoxJsonl,
  parseFfufJsonl,
  parseNaabuJsonl,
} from './parsers.js';
import {
  normalizeDalfox,
  normalizeFfuf,
  normalizeNaabu,
  normalizeSubdomains,
} from './stage-findings.js';

const remediationOf = (f: { data: Record<string, unknown> }) =>
  f.data.remediation;

describe('normalizeNaabu', () => {
  it('turns the recorded scan into one INFO finding for the unknown port, mapped back to the hostname', () => {
    const findings = normalizeNaabu(
      parseNaabuJsonl(NAABU_RECORDED),
      new Map([['172.24.0.2', 'juice.lab.test']]),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      title: 'Open port 3000/tcp (unknown service) on juice.lab.test',
      severity: 'INFO',
      confidence: 'CONFIRMED',
      matchedAt: 'juice.lab.test:3000',
    });
    expect(remediationOf(findings[0])).toEqual(expect.any(String));
  });

  it('rates exposed databases and remote administration, and leaves web ports at INFO', () => {
    const records = [
      { ip: '1.2.3.4', port: 6379, protocol: 'tcp' },
      { ip: '1.2.3.4', port: 3389, protocol: 'tcp' },
      { ip: '1.2.3.4', port: 2375, protocol: 'tcp' },
      { ip: '1.2.3.4', port: 443, protocol: 'tcp' },
    ];
    const severities = normalizeNaabu(records, new Map()).map(
      (f) => f.severity,
    );
    expect(severities).toEqual(['MEDIUM', 'MEDIUM', 'HIGH', 'INFO']);
  });
});

describe('normalizeFfuf', () => {
  it('turns the recorded run into findings, flagging the metrics endpoint', () => {
    const findings = normalizeFfuf(parseFfufJsonl(FFUF_RECORDED));
    const byPath = Object.fromEntries(findings.map((f) => [f.path, f]));
    expect(byPath['/metrics']).toMatchObject({
      severity: 'MEDIUM',
      vulnType: 'exposed-content',
    });
    expect(byPath['/ftp']).toMatchObject({ severity: 'LOW' });
    expect(byPath['/robots.txt']).toMatchObject({ severity: 'INFO' });
    expect(byPath['/assets'].severity).toBe('INFO');
    expect(findings.every((f) => typeof remediationOf(f) === 'string')).toBe(
      true,
    );
  });

  it('rates by what was reachable: a served .git is HIGH, a protected one is not', () => {
    const served = normalizeFfuf([
      {
        url: 'https://x.example.org/.git/HEAD',
        status: 200,
        length: 23,
        words: 2,
        lines: 1,
        contentType: 'text/plain',
        redirectLocation: null,
      },
    ]);
    const protectedRecord = normalizeFfuf([
      {
        url: 'https://x.example.org/.git/HEAD',
        status: 403,
        length: 10,
        words: 1,
        lines: 1,
        contentType: null,
        redirectLocation: null,
      },
    ]);
    expect(served[0].severity).toBe('HIGH');
    expect(protectedRecord[0].severity).toBe('INFO');
    expect(protectedRecord[0].description).toContain('protected');
  });

  it('records a redirect without following it, and de-duplicates a path', () => {
    const record = {
      url: 'https://x.example.org/admin',
      status: 301,
      length: 0,
      words: 0,
      lines: 0,
      contentType: null,
      redirectLocation: 'https://evil.test/',
    };
    const findings = normalizeFfuf([record, record]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('INFO');
    expect(findings[0].description).toContain('not followed');
  });
});

describe('normalizeDalfox', () => {
  it('turns the recorded verified XSS into a HIGH finding with request and payload evidence', () => {
    const [finding] = normalizeDalfox(
      parseDalfoxJsonl(DALFOX_RECORDED_VULNERABLE),
    );
    expect(finding).toMatchObject({
      title: 'Cross-site scripting (verified) in parameter "q"',
      severity: 'HIGH',
      confidence: 'CONFIRMED',
      cwe: 'CWE-79',
      owaspCategory: 'A03_INJECTION',
      path: '/search',
    });
    expect(finding.evidence.payload).toContain('<svg onload=alert(1)');
    expect(finding.evidence.request).toContain('GET /search?q=');
    expect(remediationOf(finding)).toEqual(expect.stringContaining('encoding'));
  });

  it('a reflected-only record is MEDIUM and one finding per parameter and kind', () => {
    const record = {
      type: 'R',
      severity: null,
      confidence: 'medium',
      method: 'GET',
      param: 'id',
      payload: 'x',
      url: 'https://x.example.org/p?id=1',
      evidence: null,
      request: null,
      cwe: null,
      injectType: null,
    };
    const findings = normalizeDalfox([record, { ...record, payload: 'y' }]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      severity: 'MEDIUM',
      title: 'Reflected input (possible XSS) in parameter "id"',
    });
  });
});

describe('normalizeSubdomains', () => {
  it('one INFO inventory finding per subdomain', () => {
    const [finding] = normalizeSubdomains([
      { host: 'api.example.org', addresses: ['93.184.216.34'] },
    ]);
    expect(finding).toMatchObject({
      severity: 'INFO',
      vulnType: 'subdomain',
      matchedAt: 'api.example.org',
    });
    expect(finding.description).toContain('93.184.216.34');
  });
});
