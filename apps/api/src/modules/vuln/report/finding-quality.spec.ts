import { describe, expect, it } from '@jest/globals';
import {
  computeScore,
  dedupeFindings,
  extractCves,
  issueKeyFor,
  mergedVerification,
  reportConfidence,
  verificationOf,
  type RawFinding,
} from './finding-quality.js';

let counter = 0;
function raw(overrides: Partial<RawFinding>): RawFinding {
  counter += 1;
  return {
    id: `f${counter}`,
    scanner: 'SECORA_CHECKS',
    title: 'T',
    description: 'D',
    severity: 'LOW',
    vulnType: 'header-csp-missing',
    signature: 'sig',
    path: '/',
    matchedAt: 'https://shop.example.org',
    data: {},
    tags: [],
    references: [],
    cwe: null,
    owaspCategory: null,
    evidence: { request: null, response: null, payload: null },
    ...overrides,
  };
}

const nuclei = (
  templateId: string,
  matchedAt: string,
  severity: RawFinding['severity'],
  tags: string[] = [],
) =>
  raw({
    scanner: 'NUCLEI',
    vulnType: tags[0] ?? 'x',
    signature: templateId,
    severity,
    matchedAt,
    tags,
    data: { templateId },
  });

describe('issueKeyFor', () => {
  it('maps the same exposure from different tools onto one class', () => {
    const ffuf = (path: string) =>
      raw({
        scanner: 'FFUF',
        vulnType: 'exposed-content',
        matchedAt: `https://shop.example.org${path}`,
      });
    expect(issueKeyFor(ffuf('/.git/HEAD'))).toBe('exposed-git');
    expect(
      issueKeyFor(
        nuclei('git-config', 'https://shop.example.org/.git/config', 'MEDIUM'),
      ),
    ).toBe('exposed-git');
    expect(issueKeyFor(ffuf('/.env'))).toBe('exposed-env');
    expect(
      issueKeyFor(
        nuclei('laravel-env', 'https://shop.example.org/.env', 'HIGH'),
      ),
    ).toBe('exposed-env');
    expect(issueKeyFor(ffuf('/metrics'))).toBe('exposed-metrics');
    expect(
      issueKeyFor(
        nuclei(
          'prometheus-metrics',
          'https://shop.example.org/metrics',
          'MEDIUM',
        ),
      ),
    ).toBe('exposed-metrics');
    expect(issueKeyFor(ffuf('/swagger.json'))).toBe('exposed-api-docs');
    expect(issueKeyFor(ffuf('/backup.zip'))).toBe('exposed-backup');
    expect(issueKeyFor(ffuf('/uploads'))).toBe('exposed-path:/uploads');
  });

  it('keeps tool-specific classes for everything else', () => {
    expect(
      issueKeyFor(
        raw({ scanner: 'DALFOX', data: { param: 'q', kind: 'verified' } }),
      ),
    ).toBe('xss:q:verified');
    expect(
      issueKeyFor(
        raw({ scanner: 'NAABU', data: { ip: '1.2.3.4', port: 6379 } }),
      ),
    ).toBe('open-port:1.2.3.4:6379');
    expect(
      issueKeyFor(
        nuclei('some-cve-2024-1', 'https://shop.example.org/x', 'HIGH'),
      ),
    ).toBe('nuclei:some-cve-2024-1');
    expect(issueKeyFor(raw({ vulnType: 'cookie-no-secure:session' }))).toBe(
      'cookie-no-secure:session',
    );
  });
});

describe('dedupeFindings', () => {
  it('merges nuclei and the native check for the same header issue on the same origin', () => {
    const native = raw({
      vulnType: 'header-csp-missing',
      severity: 'LOW',
      matchedAt: 'https://shop.example.org',
    });
    const summary = nuclei(
      'http-missing-security-headers',
      'https://shop.example.org/',
      'INFO',
    );
    const out = dedupeFindings([summary, native]);
    expect(out).toHaveLength(1);
    expect(out[0].issueKey).toBe('header-csp-missing');
    expect(out[0].members.map((m) => m.scanner).sort()).toEqual([
      'NUCLEI',
      'SECORA_CHECKS',
    ]);
    expect(out[0].primary.scanner).toBe('SECORA_CHECKS');
    expect(out[0].severity).toBe('LOW');
  });

  it("keeps nuclei's headers summary when no native check covers that origin", () => {
    const out = dedupeFindings([
      nuclei(
        'http-missing-security-headers',
        'https://other.example.org/',
        'INFO',
      ),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].issueKey).toBe('headers-summary');
  });

  it('merges ffuf and nuclei on the same exposed file, taking the highest severity and the more specific tool', () => {
    const f = raw({
      scanner: 'FFUF',
      vulnType: 'exposed-content',
      severity: 'HIGH',
      matchedAt: 'https://shop.example.org/.git/HEAD',
    });
    const n = nuclei(
      'git-config',
      'https://shop.example.org/.git/config',
      'MEDIUM',
      ['exposure'],
    );
    const out = dedupeFindings([n, f]);
    // .git/HEAD and .git/config are different paths: two assets, one class each.
    expect(out).toHaveLength(2);

    const sameFile = nuclei(
      'git-config',
      'https://shop.example.org/.git/HEAD',
      'MEDIUM',
      ['exposure'],
    );
    const merged = dedupeFindings([sameFile, f]);
    expect(merged).toHaveLength(1);
    expect(merged[0].severity).toBe('HIGH');
    expect(merged[0].primary.scanner).toBe('FFUF');
    expect(merged[0].members).toHaveLength(2);
  });

  it('never raises severity above what a source assigned', () => {
    const out = dedupeFindings([
      raw({ vulnType: 'header-csp-missing', severity: 'INFO' }),
      raw({
        scanner: 'NUCLEI',
        vulnType: 'x',
        signature: 'http-missing-security-headers',
        data: { templateId: 'http-missing-security-headers' },
        severity: 'LOW',
      }),
    ]);
    expect(out[0].severity).toBe('LOW');
    const only = dedupeFindings([
      raw({ severity: 'INFO' }),
      raw({ severity: 'INFO' }),
    ]);
    expect(only[0].severity).toBe('INFO');
  });

  it('does not merge different origins, different paths or different classes', () => {
    const out = dedupeFindings([
      raw({
        vulnType: 'header-csp-missing',
        matchedAt: 'https://shop.example.org',
      }),
      raw({
        vulnType: 'header-csp-missing',
        matchedAt: 'http://shop.example.org',
      }),
      raw({
        vulnType: 'header-csp-missing',
        matchedAt: 'https://api.example.org',
      }),
      raw({
        vulnType: 'header-hsts-missing',
        matchedAt: 'https://shop.example.org',
      }),
      raw({
        scanner: 'FFUF',
        vulnType: 'exposed-content',
        matchedAt: 'https://shop.example.org/uploads',
      }),
      raw({
        scanner: 'FFUF',
        vulnType: 'exposed-content',
        matchedAt: 'https://shop.example.org/files',
      }),
    ]);
    expect(out).toHaveLength(6);
  });

  it('collapses the same finding seen twice', () => {
    const a = raw({
      scanner: 'FFUF',
      vulnType: 'exposed-content',
      matchedAt: 'https://shop.example.org/metrics',
      severity: 'MEDIUM',
    });
    const b = raw({
      scanner: 'FFUF',
      vulnType: 'exposed-content',
      matchedAt: 'https://shop.example.org/metrics/',
      severity: 'MEDIUM',
    });
    expect(dedupeFindings([a, b])).toHaveLength(1);
  });

  it('sorts most severe first', () => {
    const out = dedupeFindings([
      raw({ vulnType: 'header-referrer-policy-missing', severity: 'INFO' }),
      raw({ vulnType: 'cors-reflected-credentials', severity: 'HIGH' }),
      raw({ vulnType: 'header-hsts-missing', severity: 'LOW' }),
    ]);
    expect(out.map((g) => g.severity)).toEqual(['HIGH', 'LOW', 'INFO']);
  });
});

describe('verification and confidence', () => {
  it('parses stored verification and rejects junk', () => {
    expect(
      verificationOf({
        verification: {
          status: 'REPRODUCED',
          method: 'exposed-file',
          checkedAt: '2026-10-22T00:00:00Z',
          detail: 'HTTP 200',
        },
      }),
    ).toEqual({
      status: 'REPRODUCED',
      method: 'exposed-file',
      checkedAt: '2026-10-22T00:00:00Z',
      detail: 'HTTP 200',
    });
    expect(verificationOf({})).toBeNull();
    expect(verificationOf({ verification: { status: 'MAYBE' } })).toBeNull();
    expect(verificationOf({ verification: 'yes' })).toBeNull();
  });

  it('CONFIRMED only when a re-check reproduced it', () => {
    const reproduced = {
      status: 'REPRODUCED' as const,
      method: 'x',
      checkedAt: null,
      detail: null,
    };
    const none = {
      status: 'NOT_APPLICABLE' as const,
      method: null,
      checkedAt: null,
      detail: null,
    };
    expect(reportConfidence('HIGH', reproduced)).toBe('CONFIRMED');
    expect(reportConfidence('HIGH', none)).toBe('LIKELY');
    expect(
      reportConfidence('HIGH', { ...none, status: 'NOT_REPRODUCED' }),
    ).toBe('LIKELY');
    expect(reportConfidence('HIGH', { ...none, status: 'FAILED' })).toBe(
      'LIKELY',
    );
    expect(reportConfidence('INFO', reproduced)).toBe('INFO');
  });

  it('a tool saying "CONFIRMED" is not enough', () => {
    const f = raw({ scanner: 'NUCLEI', severity: 'HIGH' });
    expect(reportConfidence(f.severity, mergedVerification([f]))).toBe(
      'LIKELY',
    );
  });

  it('merged verification prefers a reproduced re-check, then a failed one', () => {
    const a = raw({
      data: {
        verification: { status: 'NOT_REPRODUCED', method: 'missing-header' },
      },
    });
    const b = raw({
      data: {
        verification: { status: 'REPRODUCED', method: 'missing-header' },
      },
    });
    expect(mergedVerification([a, b]).status).toBe('REPRODUCED');
    expect(mergedVerification([a, raw({})]).status).toBe('NOT_REPRODUCED');
    expect(mergedVerification([raw({})]).status).toBe('NOT_APPLICABLE');
  });
});

describe('extractCves', () => {
  it('finds, upper-cases, de-duplicates and sorts', () => {
    expect(
      extractCves(
        'see cve-2024-12345 and CVE-2021-44228',
        null,
        'CVE-2021-44228 again',
      ),
    ).toEqual(['CVE-2021-44228', 'CVE-2024-12345']);
    expect(extractCves(undefined)).toEqual([]);
  });
});

describe('computeScore', () => {
  const f = (
    severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
    confidence: 'CONFIRMED' | 'LIKELY' | 'INFO',
  ) => ({ severity, confidence });

  it('a clean scan is 100 / A', () => {
    expect(computeScore([])).toEqual({ score: 100, grade: 'A' });
    expect(computeScore([f('INFO', 'INFO'), f('INFO', 'INFO')])).toEqual({
      score: 100,
      grade: 'A',
    });
  });

  it('weights confirmed findings at full and unconfirmed ones at 70%', () => {
    expect(computeScore([f('MEDIUM', 'CONFIRMED')]).score).toBe(93);
    expect(computeScore([f('MEDIUM', 'LIKELY')]).score).toBe(95);
  });

  it('grade bands', () => {
    const lows = (n: number) =>
      Array.from({ length: n }, () => f('LOW', 'CONFIRMED'));
    expect(computeScore(lows(5)).grade).toBe('A'); // 90
    expect(computeScore(lows(6)).grade).toBe('B'); // 88
    expect(computeScore(lows(13)).grade).toBe('C'); // 74
    expect(computeScore(lows(20)).grade).toBe('C'); // 60
    expect(computeScore(lows(21)).grade).toBe('D'); // 58
  });

  it('a high or critical issue caps the grade however good the rest is', () => {
    expect(computeScore([f('HIGH', 'LIKELY')])).toEqual({
      score: 90,
      grade: 'C',
    });
    expect(computeScore([f('CRITICAL', 'LIKELY')]).grade).toBe('D');
    expect(
      computeScore([
        f('CRITICAL', 'CONFIRMED'),
        f('HIGH', 'CONFIRMED'),
        f('HIGH', 'CONFIRMED'),
        f('HIGH', 'CONFIRMED'),
      ]).grade,
    ).toBe('F');
  });

  it('never goes below 0', () => {
    expect(
      computeScore(Array.from({ length: 20 }, () => f('CRITICAL', 'CONFIRMED')))
        .score,
    ).toBe(0);
  });
});
