import { describe, expect, it, jest } from '@jest/globals';
import {
  VulnReportService,
  parseLanguage,
  toPublicReport,
} from './vuln-report.service.js';
import { PublicVulnReportController } from '../controllers/vuln-report.controller.js';
import { AppException } from '../../../common/exceptions/app.exception.js';

const row = (o: Record<string, unknown> = {}) => ({
  id: 'finding-uuid-1',
  scanner: 'SECORA_CHECKS',
  title: 'Content-Security-Policy header is missing',
  description: 'No CSP.',
  severity: 'LOW',
  vulnType: 'header-csp-missing',
  signature: 's',
  path: '/',
  matchedAt: 'https://shop.example.org',
  data: {
    remediation: 'Add CSP.',
    verification: { status: 'REPRODUCED', method: 'missing-header' },
  },
  tags: [],
  references: [],
  cwe: null,
  owaspCategory: null,
  requestEvidence: null,
  responseEvidence: {
    textContent: 'HTTP 200\nserver: nginx\nset-cookie: sid=TOPSECRET99; Path=/',
  },
  payloadEvidence: null,
  ...o,
});

function service(job: unknown, rows: unknown[] = [row()]) {
  const prisma = {
    vulnScanJob: { findUnique: jest.fn(async () => job) },
    vulnFinding: { findMany: jest.fn(async () => rows) },
    vulnScanJobLog: {
      findMany: jest.fn(async () => [
        {
          message:
            'Scope: shop.example.org and its subdomains (DNS ownership proof).',
        },
        { message: '[stage] checks start' },
        { message: '[stage] checks done' },
      ]),
    },
  };
  return {
    prisma,
    service: new VulnReportService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    ),
  };
}

const JOB = {
  id: 'job-uuid-1',
  status: 'COMPLETED',
  config: { profile: 'QUICK' },
  startedAt: new Date('2026-10-22T10:00:00Z'),
  completedAt: new Date('2026-10-22T10:01:00Z'),
  createdAt: new Date('2026-10-22T09:59:00Z'),
  target: { id: 'target-uuid-1', type: 'DOMAIN', value: 'shop.example.org' },
};

describe('VulnReportService.forJob', () => {
  it('builds the report from stored rows, with evidence redacted and the confirmed finding marked', async () => {
    const { service: s } = service(JOB);
    const report = await s.forJob('job-uuid-1', 'ru');
    expect(report).toMatchObject({
      jobId: 'job-uuid-1',
      profile: 'QUICK',
      language: 'ru',
      scope: { root: 'shop.example.org', includesSubdomains: true },
    });
    expect(report.findings[0].confidence).toBe('CONFIRMED');
    expect(JSON.stringify(report)).not.toContain('TOPSECRET99');
    expect(report.findings[0].stack).toBe('nginx');
  });

  it('a missing job is a 404', async () => {
    const { service: s } = service(null);
    await expect(s.forJob('nope', 'en')).rejects.toMatchObject({ status: 404 });
  });

  it('parseLanguage falls back to English for anything else', () => {
    expect(parseLanguage('uz')).toBe('uz');
    expect(parseLanguage('de')).toBe('en');
    expect(parseLanguage(undefined)).toBe('en');
  });
});

describe('toPublicReport', () => {
  it('removes internal ids but keeps the content', async () => {
    const { service: s } = service(JOB);
    const report = await s.forJob('job-uuid-1', 'en');
    const view = toPublicReport(report);
    const text = JSON.stringify(view);
    expect(text).not.toContain('job-uuid-1');
    expect(text).not.toContain('target-uuid-1');
    expect(text).not.toContain('finding-uuid-1');
    expect(view.target.value).toBe('shop.example.org');
    expect(view.findings[0]).toMatchObject({
      id: 'finding-1',
      title: report.findings[0].title,
      severity: 'LOW',
    });
  });
});

describe('PublicVulnReportController', () => {
  function controller(link: Record<string, unknown> | Error) {
    const commandBus = {
      execute: jest.fn(async () => {
        if (link instanceof Error) throw link;
        return link;
      }),
    };
    const reports = {
      forJob: jest.fn(async () => ({
        jobId: 'j',
        target: { id: 't', type: 'DOMAIN', value: 'a.example.org' },
        findings: [],
      })),
    };
    const res = { req: { ip: '203.0.113.9' } };
    return {
      commandBus,
      reports,
      ctrl: new PublicVulnReportController(
        commandBus as never,
        reports as never,
      ),
      res,
    };
  }

  it('serves a report for a valid VULN_SCAN_REPORT link, with the visitor ip and password passed on', async () => {
    const { ctrl, commandBus, reports, res } = controller({
      resourceType: 'VULN_SCAN_REPORT',
      resourceId: 'job-1',
      title: 't',
      permission: 'VIEW',
    });
    const out = await ctrl.report(
      'shl_token',
      { password: 'pw', language: 'uz' },
      res as never,
    );
    expect(out.jobId).toBe('');
    expect(reports.forJob).toHaveBeenCalledWith('job-1', 'uz');
    const command = commandBus.execute.mock.calls[0][0] as {
      rawToken: string;
      password: string;
      ipAddress: string;
    };
    expect(command).toMatchObject({
      rawToken: 'shl_token',
      password: 'pw',
      ipAddress: '203.0.113.9',
    });
  });

  it('refuses a link that points at something else, so a finding link cannot open a scan report', async () => {
    const { ctrl, reports, res } = controller({
      resourceType: 'PROJECT',
      resourceId: 'p-1',
      title: 't',
      permission: 'VIEW',
    });
    await expect(
      ctrl.report('shl_token', {}, res as never),
    ).rejects.toMatchObject({ status: 404 });
    expect(reports.forJob).not.toHaveBeenCalled();
  });

  it('expired, revoked or wrong-password links are refused by the shared handler and nothing is built', async () => {
    const { ctrl, reports, res } = controller(
      new AppException(
        'SHARE_LINK_EXPIRED_OR_REVOKED',
        'This share link has expired.',
        410,
      ),
    );
    await expect(
      ctrl.report('shl_token', {}, res as never),
    ).rejects.toMatchObject({ status: 410 });
    expect(reports.forJob).not.toHaveBeenCalled();
  });
});

describe('shared report privacy for client engagements', () => {
  it('masks the approving mailbox on a public report, and only there', async () => {
    const { maskEmail } = await import('./vuln-report.service.js');
    expect(maskEmail('ciso@acme.example')).toBe('ci***@acme.example');
    expect(maskEmail('a@acme.example')).toBe('a***@acme.example');
    expect(maskEmail('nonsense')).toBe('***');
    const { service: s } = service(JOB);
    const report = {
      ...(await s.forJob('job-uuid-1', 'en')),
      authorization: { kind: 'ROE' as const, clientName: 'Acme', approvedBy: 'ciso@acme.example' },
    };
    expect(JSON.stringify(toPublicReport(report))).not.toContain('ciso@acme.example');
    expect(toPublicReport(report).authorization.approvedBy).toBe('ci***@acme.example');
    expect(report.authorization.approvedBy).toBe('ciso@acme.example');
  });
});
