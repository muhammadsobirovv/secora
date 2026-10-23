import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildReport, profileOf, type ReportInput } from './report.builder.js';
import type { RawFinding } from './finding-quality.js';
import { PIPELINE_TOOLS } from '../pipeline/tool-versions.js';

let n = 0;
function raw(o: Partial<RawFinding>): RawFinding {
  n += 1;
  return {
    id: `f${n}`,
    scanner: 'SECORA_CHECKS',
    title: 'Content-Security-Policy header is missing',
    description: 'The site sets no CSP.',
    severity: 'LOW',
    vulnType: 'header-csp-missing',
    signature: 's',
    path: '/',
    matchedAt: 'https://shop.example.org',
    data: { remediation: 'Send a CSP header.' },
    tags: [],
    references: [],
    cwe: 'CWE-693',
    owaspCategory: 'A05_SECURITY_MISCONFIGURATION',
    evidence: {
      request: null,
      response:
        'HTTP 200\nserver: nginx/1.18.0\nset-cookie: session=SECRETSESSION42; Path=/',
      payload: null,
    },
    ...o,
  };
}

const NOW = new Date('2026-10-22T12:00:00Z');
function input(
  over: Partial<ReportInput> = {},
  status = 'COMPLETED',
): ReportInput {
  return {
    job: {
      id: 'job-1',
      status,
      config: { profile: 'STANDARD' },
      startedAt: new Date('2026-10-22T11:00:00Z'),
      completedAt: new Date('2026-10-22T11:12:00Z'),
      createdAt: new Date('2026-10-22T10:59:00Z'),
    },
    target: { id: 't1', type: 'DOMAIN', value: 'shop.example.org' },
    findings: [],
    logs: [],
    language: 'en',
    now: NOW,
    ...over,
  };
}

const allStagesDone = (names: string[]) =>
  names.flatMap((s) => [`[stage] ${s} start`, `[stage] ${s} done`]);

describe('buildReport — summary', () => {
  it('a clean scan is 100 / A with zero counts', () => {
    const r = buildReport(
      input({
        logs: allStagesDone(['recon', 'checks', 'crawl', 'scan', 'verify']),
      }),
    );
    expect(r).toMatchObject({
      score: 100,
      grade: 'A',
      profile: 'STANDARD',
      status: 'COMPLETED',
      language: 'en',
    });
    expect(r.counts).toEqual({
      INFO: 0,
      LOW: 0,
      MEDIUM: 0,
      HIGH: 0,
      CRITICAL: 0,
    });
    expect(r.generatedAt).toBe(NOW.toISOString());
    expect(r.startedAt).toBe('2026-10-22T11:00:00.000Z');
  });

  it('counts severities and confidences over de-duplicated findings', () => {
    const r = buildReport(
      input({
        findings: [
          raw({
            vulnType: 'header-csp-missing',
            severity: 'LOW',
            data: {
              verification: { status: 'REPRODUCED', method: 'missing-header' },
            },
          }),
          raw({ vulnType: 'header-hsts-missing', severity: 'LOW' }),
          raw({ vulnType: 'header-referrer-policy-missing', severity: 'INFO' }),
          raw({ vulnType: 'cors-reflected-credentials', severity: 'HIGH' }),
        ],
      }),
    );
    expect(r.counts).toMatchObject({ HIGH: 1, LOW: 2, INFO: 1 });
    expect(r.confidenceCounts).toEqual({ CONFIRMED: 1, LIKELY: 2, INFO: 1 });
    expect(r.findings[0].severity).toBe('HIGH');
    expect(r.grade).toBe('C'); // a high finding caps the grade
  });
});

describe('buildReport — findings', () => {
  it('merges tools, keeps every source, redacts evidence and picks a snippet for the detected stack', () => {
    const r = buildReport(
      input({
        findings: [
          raw({}),
          raw({
            scanner: 'NUCLEI',
            vulnType: 'x',
            signature: 'http-missing-security-headers',
            data: { templateId: 'http-missing-security-headers' },
            severity: 'INFO',
            matchedAt: 'https://shop.example.org/',
          }),
        ],
      }),
    );
    expect(r.findings).toHaveLength(1);
    const f = r.findings[0];
    expect(f.sources.map((s) => s.tool).sort()).toEqual([
      'NUCLEI',
      'SECORA_CHECKS',
    ]);
    expect(f.stack).toBe('nginx');
    expect(f.snippet?.code).toContain('add_header Content-Security-Policy');
    expect(f.evidence.response).toContain('set-cookie: session=<redacted>');
    expect(JSON.stringify(r)).not.toContain('SECRETSESSION42');
    expect(f.remediation).toBe('Send a CSP header.');
    expect(f.references).toContain(
      'https://cwe.mitre.org/data/definitions/693.html',
    );
    expect(f.verification.status).toBe('NOT_APPLICABLE');
    expect(f.confidence).toBe('LIKELY');
  });

  it('caps evidence and falls back to the built-in fix when a tool wrote none', () => {
    const big = 'x'.repeat(20000);
    const r = buildReport(
      input({
        findings: [
          raw({
            data: {},
            evidence: { request: big, response: null, payload: null },
          }),
        ],
      }),
    );
    expect(r.findings[0].evidence.request!.length).toBeLessThan(3200);
    expect(r.findings[0].remediation.length).toBeGreaterThan(30);
  });

  it('extracts CVE ids and keeps only http(s) references', () => {
    const r = buildReport(
      input({
        findings: [
          raw({
            scanner: 'NUCLEI',
            vulnType: 'cve',
            signature: 'cve-2021-44228',
            data: { templateId: 'cve-2021-44228' },
            title: 'Log4j RCE (CVE-2021-44228)',
            severity: 'CRITICAL',
            references: [
              'https://nvd.nist.gov/vuln/detail/CVE-2021-44228',
              'javascript:alert(1)',
            ],
            matchedAt: 'https://shop.example.org/x',
          }),
        ],
      }),
    );
    expect(r.findings[0].cves).toEqual(['CVE-2021-44228']);
    expect(r.findings[0].references).toEqual([
      'https://nvd.nist.gov/vuln/detail/CVE-2021-44228',
      'https://cwe.mitre.org/data/definitions/693.html',
    ]);
    expect(r.grade).toBe('D');
  });
});

describe('buildReport — stages, tools and what was not tested', () => {
  it('reports each stage of the profile, with failed and skipped ones and their reasons', () => {
    const r = buildReport(
      input({
        logs: [
          'Scope: shop.example.org only (the ownership proof covers this host, not its subdomains).',
          ...allStagesDone(['recon', 'checks']),
          '[stage] crawl start',
          '[stage] crawl failed - partial: the crawl reached its time limit',
          '[stage] scan skipped - no live web service was found',
        ],
      }),
    );
    expect(r.stages.map((s) => `${s.stage}:${s.state}`)).toEqual([
      'recon:done',
      'checks:done',
      'crawl:failed',
      'scan:skipped',
      'verify:not-run',
    ]);
    expect(r.scope).toEqual({
      root: 'shop.example.org',
      includesSubdomains: false,
    });
    const codes = r.notTested.map((x) => x.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'STAGE_FAILED',
        'STAGE_SKIPPED',
        'STAGE_NOT_RUN',
        'SUBDOMAINS_NOT_COVERED',
        'NO_PORT_SCAN',
        'NO_XSS_TESTING',
        'NO_AUTH',
        'HTTP_TEMPLATES_ONLY',
      ]),
    );
    expect(r.notTested.find((x) => x.code === 'STAGE_FAILED')).toMatchObject({
      stage: 'crawl',
      detail: 'partial: the crawl reached its time limit',
    });
    expect(r.notTested.find((x) => x.code === 'STAGE_SKIPPED')).toMatchObject({
      stage: 'scan',
    });
  });

  it('a stage that started and never finished counts as failed once the job ended', () => {
    const r = buildReport(input({ logs: ['[stage] checks start'] }, 'FAILED'));
    expect(r.stages.find((s) => s.stage === 'checks')).toMatchObject({
      state: 'failed',
    });
    const running = buildReport(
      input({ logs: ['[stage] checks start'] }, 'RUNNING'),
    );
    expect(running.stages.find((s) => s.stage === 'checks')?.state).toBe(
      'not-run',
    );
  });

  it('lists the tools of the profile with their versions and whether they ran', () => {
    const r = buildReport(input({ logs: allStagesDone(['recon', 'checks']) }));
    const byName = Object.fromEntries(r.tools.map((t) => [t.tool, t]));
    expect(byName.httpx).toEqual({
      tool: 'httpx',
      version: '1.12.0',
      ran: true,
    });
    expect(byName.katana).toEqual({
      tool: 'katana',
      version: '1.7.0',
      ran: false,
    });
    expect(byName.dalfox).toBeUndefined(); // not part of STANDARD
  });

  it('QUICK is explicit that only the home page was examined and no templates ran', () => {
    const r = buildReport(
      input({
        job: { ...input().job, config: { profile: 'QUICK' } },
        logs: allStagesDone(['checks', 'verify']),
      }),
    );
    expect(r.stages.map((s) => s.stage)).toEqual(['checks', 'verify']);
    expect(r.notTested.map((x) => x.code)).toEqual(
      expect.arrayContaining([
        'HOME_PAGE_ONLY',
        'NO_TEMPLATES',
        'NO_PORT_SCAN',
      ]),
    );
  });

  it('a job without a profile still produces a report', () => {
    expect(profileOf(null)).toBeNull();
    const r = buildReport(input({ job: { ...input().job, config: null } }));
    expect(r.profile).toBeNull();
    expect(r.stages).toEqual([]);
  });
});

describe('tool versions match the worker image', () => {
  const dockerfile = readFileSync(
    join(process.cwd(), 'Dockerfile.worker'),
    'utf8',
  );
  it.each(PIPELINE_TOOLS.filter((t) => t.dockerArg))(
    '$tool $version',
    ({ version, dockerArg }) => {
      const match = new RegExp(`^ARG ${dockerArg}=(\\S+)`, 'm').exec(
        dockerfile,
      );
      expect(match?.[1]).toBe(version);
    },
  );
});
