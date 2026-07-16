import { describe, expect, it } from '@jest/globals';
import {
  renderBugReportTemplate,
  type BugReportRenderInput,
} from './bug-report-template-renderer.js';
import type { BugBountyFinding, BugReport } from '../../../prisma-types.js';

function baseReport(overrides: Partial<BugReport> = {}): BugReport {
  return {
    id: 'report-1',
    title: 'Reflected XSS in search box',
    summary: 'A reflected XSS was found in the search box.',
    stepsToReproduce: '1. Go to /search\n2. Enter payload',
    proofOfConcept: '<script>alert(1)</script>',
    impact: 'An attacker could steal session cookies.',
    mitigation: 'Encode output.',
    cwe: 'CWE-79',
    cvssScore: 6.1,
    cvssVector: 'AV:N/AC:L',
    references: ['https://owasp.org/xss'],
    ...overrides,
  } as unknown as BugReport;
}

function baseFinding(
  overrides: Partial<BugBountyFinding> = {},
): BugBountyFinding {
  return {
    id: 'finding-1',
    severity: 'HIGH',
    endpoint: '/search',
    vulnType: 'XSS',
    ...overrides,
  } as unknown as BugBountyFinding;
}

function input(
  overrides: Partial<BugReportRenderInput> = {},
): BugReportRenderInput {
  return {
    report: baseReport(),
    program: {} as BugReportRenderInput['program'],
    finding: baseFinding(),
    ...overrides,
  };
}

describe('renderBugReportTemplate', () => {
  it('renders generic Markdown with every populated section for the MARKDOWN template', () => {
    const out = renderBugReportTemplate('MARKDOWN', input());
    expect(out).toContain('# Reflected XSS in search box');
    expect(out).toContain('## Summary');
    expect(out).toContain('## Steps to Reproduce');
    expect(out).toContain('## Proof of Concept');
    expect(out).toContain('## Impact');
    expect(out).toContain('## Suggested Mitigation');
    expect(out).toContain('## References');
    expect(out).toContain('- https://owasp.org/xss');
  });

  it('omits sections whose backing field is empty', () => {
    const out = renderBugReportTemplate(
      'MARKDOWN',
      input({ report: baseReport({ mitigation: null, references: [] }) }),
    );
    expect(out).not.toContain('## Suggested Mitigation');
    expect(out).not.toContain('## References');
  });

  it('merges steps + PoC into a single "Description" section for the HackerOne template', () => {
    const out = renderBugReportTemplate('HACKERONE', input());
    expect(out).toContain('## Description');
    expect(out).toContain('1. Go to /search');
    expect(out).toContain('<script>alert(1)</script>');
    expect(out).not.toContain('## Steps to Reproduce');
  });

  it('keeps steps and PoC as distinct sections for the Bugcrowd template', () => {
    const out = renderBugReportTemplate('BUGCROWD', input());
    expect(out).toContain('## Steps to Reproduce');
    expect(out).toContain('## Proof of Concept');
    expect(out).toContain('## Suggested Fix');
  });

  it('leads with the CVSS score for the Intigriti template', () => {
    const out = renderBugReportTemplate('INTIGRITI', input());
    expect(out.split('\n')[2]).toContain('CVSS Score');
  });

  it('produces well-formed, escaped HTML for the HTML template', () => {
    const out = renderBugReportTemplate(
      'HTML',
      input({
        report: baseReport({ summary: '<img src=x onerror=alert(1)>' }),
      }),
    );
    expect(out).toContain('<!DOCTYPE html>');
    expect(out).toContain('<h1>Reflected XSS in search box</h1>');
    // The malicious summary text must be escaped, not injected as raw HTML.
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(out).not.toContain('<img src=x onerror=alert(1)>');
  });

  it('falls back to the Markdown renderer for the PDF template (no dedicated PDF layout)', () => {
    const markdown = renderBugReportTemplate('MARKDOWN', input());
    const pdf = renderBugReportTemplate('PDF', inp