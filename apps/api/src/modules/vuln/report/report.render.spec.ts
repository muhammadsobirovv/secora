import { describe, expect, it } from '@jest/globals';
import type {
  FindingExplanationDto,
  ReportLanguage,
  VulnReportDto,
} from '@pentesthub/shared';
import { buildReport } from './report.builder.js';
import type { RawFinding } from './finding-quality.js';
import { escapeHtml, renderReportHtml, REPORT_CSP } from './report.html.js';
import { renderReportPdf, toWinAnsi } from './report.pdf.js';
import { notTestedText, text } from './report-text.js';

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
    references: ['https://developer.mozilla.org/docs/Web/HTTP/CSP'],
    cwe: 'CWE-693',
    owaspCategory: null,
    evidence: {
      request: null,
      response: 'HTTP 200\nserver: nginx/1.18.0',
      payload: null,
    },
    ...o,
  };
}

function sample(
  language: ReportLanguage = 'en',
  extra: Partial<RawFinding>[] = [],
): VulnReportDto {
  return buildReport({
    job: {
      id: 'job-1',
      status: 'COMPLETED',
      config: { profile: 'STANDARD' },
      startedAt: new Date('2026-10-22T11:00:00Z'),
      completedAt: new Date('2026-10-22T11:12:00Z'),
      createdAt: new Date('2026-10-22T10:59:00Z'),
    },
    target: { id: 't1', type: 'DOMAIN', value: 'shop.example.org' },
    findings: [
      raw({}),
      raw({
        vulnType: 'cors-reflected-credentials',
        severity: 'HIGH',
        title: 'CORS reflects any origin and allows credentials',
      }),
      ...extra.map(raw),
    ],
    logs: [
      'Scope: shop.example.org only (x).',
      '[stage] recon start',
      '[stage] recon done',
      '[stage] crawl start',
      '[stage] crawl failed - timed out',
    ],
    language,
    now: new Date('2026-10-22T12:00:00Z'),
  });
}

const HOSTILE = '"><script>alert(1)</script><img src=x onerror=alert(2)>';

describe('renderReportHtml', () => {
  it('is a complete, mobile-ready, script-free page', () => {
    const html = renderReportHtml(sample());
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain(
      '<meta name="viewport" content="width=device-width,initial-scale=1">',
    );
    expect(html).toContain('<html lang="en">');
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/\son\w+=/i);
    expect(html).toContain('@media print');
    expect(html).toContain('shop.example.org');
    expect(REPORT_CSP).toContain("default-src 'none'");
  });

  it('escapes everything a scan can influence', () => {
    const report = sample('en', [
      {
        vulnType: 'x',
        scanner: 'NUCLEI',
        signature: 'x',
        data: { templateId: 'x' },
        title: HOSTILE,
        description: HOSTILE,
        matchedAt: `https://shop.example.org/${encodeURIComponent(HOSTILE)}`,
        evidence: { request: HOSTILE, response: HOSTILE, payload: HOSTILE },
      },
    ]);
    const html = renderReportHtml(report);
    expect(html).not.toContain('<script>alert(1)');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(escapeHtml(`<a href="x">'&</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&lt;/a&gt;',
    );
  });

  it('only links http(s) references', () => {
    const report = sample();
    report.findings[0].references = [
      'javascript:alert(1)',
      'https://example.org/ok',
    ];
    const html = renderReportHtml(report);
    expect(html).not.toContain('javascript:');
  });

  it('states what was not tested, the failed stage and the tool versions', () => {
    const html = renderReportHtml(sample());
    expect(html).toContain('What was NOT tested');
    expect(html).toContain('failed or stopped early');
    expect(html).toContain('Pages behind a login were not tested.');
    expect(html).toContain('1.12.0');
    expect(html).toContain('Subdomains were not scanned');
  });

  it('uses a provided explanation, otherwise the built-in one, and says which', () => {
    const report = sample();
    const id = report.findings[0].id;
    const provided: FindingExplanationDto = {
      findingId: id,
      language: 'en',
      source: 'AI',
      cached: false,
      whatIsThis: 'AI wrote this sentence about the finding.',
      whyItMatters: 'AI explains why.',
      howToFix: 'AI explains the fix.',
      snippet: null,
    };
    const html = renderReportHtml(report, {
      explanations: new Map([[id, provided]]),
    });
    expect(html).toContain('AI wrote this sentence');
    expect(html).toContain('written by AI');
    expect(renderReportHtml(report)).not.toContain('AI wrote this sentence');
  });

  it.each(['en', 'uz', 'ru'] as const)('renders fully in %s', (language) => {
    const html = renderReportHtml(sample(language));
    expect(html).toContain(`<html lang="${language}">`);
    expect(html).toContain(escapeHtml(text(language, 'notTested')));
    expect(html).toContain(escapeHtml(text(language, 'howToFix')));
    // no key left untranslated
    expect(html).not.toMatch(
      /\b(nt_|sev_|conf_|stage_|state_|ver_|prof_)[A-Za-z_-]+/,
    );
  });

  it('an empty scan says so and still lists what was not tested', () => {
    const report = sample();
    report.findings = [];
    const html = renderReportHtml(report);
    expect(html).toContain('No findings were reported.');
    expect(html).toContain('What was NOT tested');
  });
});

describe('report text', () => {
  it('has every not-tested code in all three languages', () => {
    const codes = [
      'STAGE_FAILED',
      'STAGE_SKIPPED',
      'STAGE_NOT_RUN',
      'NO_AUTH',
      'NO_BUSINESS_LOGIC',
      'HOME_PAGE_ONLY',
      'NO_TEMPLATES',
      'NO_PORT_SCAN',
      'NO_CONTENT_DISCOVERY',
      'NO_XSS_TESTING',
      'NO_STORED_XSS',
      'HTTP_TEMPLATES_ONLY',
      'SUBDOMAINS_NOT_COVERED',
    ] as const;
    for (const l of ['en', 'uz', 'ru'] as const) {
      for (const code of codes) {
        const out = notTestedText(l, { code, stage: 'crawl', detail: 'x' });
        expect(out).not.toContain('nt_');
        expect(out.length).toBeGreaterThan(10);
      }
    }
  });
});

describe('renderReportPdf', () => {
  const pdf = (report: VulnReportDto) =>
    renderReportPdf(report).toString('latin1');

  it('writes a structurally valid PDF whose xref offsets point at the objects', () => {
    const buffer = renderReportPdf(sample());
    const body = buffer.toString('latin1');
    expect(body.startsWith('%PDF-1.4')).toBe(true);
    expect(body.trimEnd().endsWith('%%EOF')).toBe(true);
    const startxref = Number(/startxref\n(\d+)/.exec(body)![1]);
    expect(body.slice(startxref, startxref + 4)).toBe('xref');
    const table = body.slice(startxref).split('\n').slice(3);
    const offsets = table
      .filter((line) => /^\d{10} 00000 n/.test(line))
      .map((line) => Number(line.slice(0, 10)));
    expect(offsets.length).toBeGreaterThan(5);
    offsets.forEach((offset, index) =>
      expect(body.slice(offset, offset + `${index + 1} 0 obj`.length)).toBe(
        `${index + 1} 0 obj`,
      ),
    );
    const count = Number(/\/Count (\d+)/.exec(body)![1]);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('contains the content as escaped text and nothing executable', () => {
    const body = pdf(sample());
    expect(body).toContain('Security scan report');
    expect(body).toContain('CORS reflects any origin');
    expect(body).not.toMatch(
      /\/JavaScript|\/JS |\/OpenAction|\/Launch|\/EmbeddedFile/,
    );
  });

  it('escapes parentheses and backslashes from scan text', () => {
    const report = sample('en', [
      {
        vulnType: 'x',
        scanner: 'NUCLEI',
        signature: 'x',
        data: { templateId: 'x' },
        title: 'a ) b ( c \\ d',
        matchedAt: 'https://shop.example.org/p',
      },
    ]);
    const body = pdf(report);
    expect(body).toContain('a \\) b \\( c \\\\ d');
  });

  it('spans several pages when the report is long, and keeps long tokens inside the page', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      vulnType: `x${i}`,
      scanner: 'NUCLEI' as const,
      signature: `x${i}`,
      data: { templateId: `x${i}` },
      title: `Finding number ${i} ${'W'.repeat(200)}`,
      matchedAt: `https://shop.example.org/p${i}`,
    }));
    const body = pdf(sample('en', many));
    expect(Number(/\/Count (\d+)/.exec(body)![1])).toBeGreaterThan(2);
  });

  it('transliterates Russian and simplifies Uzbek so Latin-only fonts can show them', () => {
    expect(toWinAnsi('Привет, мир')).toBe('Privet, mir');
    expect(toWinAnsi('Щука Ёж')).toBe('Shchuka Ezh');
    expect(toWinAnsi('o‘zbek gʻoya')).toBe("o'zbek g'oya");
    expect(toWinAnsi('日本')).toBe('??');
    for (const l of ['uz', 'ru'] as const) {
      const body = pdf(sample(l));
      expect(body).toContain('/Type /Catalog');
      // only WinAnsi-safe bytes
      expect([...body].every((c) => c.charCodeAt(0) <= 255)).toBe(true);
    }
  });
});

describe('report authorization', () => {
  const roe = (language: 'en' | 'uz' | 'ru' = 'en', clientName = 'Acme Ltd'): VulnReportDto => ({
    ...sample(language),
    authorization: {
      kind: 'ROE',
      clientName,
      windowStart: '2026-10-24T09:00:00.000Z',
      windowEnd: '2026-11-07T17:00:00.000Z',
      approvedAt: '2026-10-23T10:00:00.000Z',
      approvedBy: 'ciso@acme.example',
    },
  });

  it('a client engagement report names the client, the window, the approval and the approving mailbox', () => {
    const html = renderReportHtml(roe());
    expect(html).toContain('Acme Ltd');
    expect(html).toContain('2026-10-24T09:00:00.000Z');
    expect(html).toContain('2026-11-07T17:00:00.000Z');
    expect(html).toContain('2026-10-23T10:00:00.000Z');
    expect(html).toContain('ciso@acme.example');
    expect(html).toContain('does not prove who the person is');
    const pdf = renderReportPdf(roe()).toString('latin1');
    expect(pdf).toContain('Acme Ltd');
    expect(pdf).toContain('ciso@acme.example');
  });

  it('uses the client wording for the scope, and the ownership wording otherwise', () => {
    expect(renderReportHtml(roe())).toContain('client authorization');
    const own = renderReportHtml(sample());
    expect(own).toContain('The owner verified control of the website');
    expect(own).not.toContain('client authorization');
  });

  it('is translated', () => {
    expect(renderReportHtml(roe('uz'))).toContain('Mijoz bilan kelishuv');
    expect(renderReportHtml(roe('ru'))).toContain('Работа для клиента');
  });

  it('escapes a hostile client name', () => {
    const html = renderReportHtml(roe('en', HOSTILE));
    expect(html).not.toContain('<script>alert(1)</script>');
  });
});
