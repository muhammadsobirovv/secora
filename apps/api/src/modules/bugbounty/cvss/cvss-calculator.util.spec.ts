import { describe, expect, it } from '@jest/globals';
import { calculateCvss, cvssVectorString, parseCvssVector, severityForCvssScore } from './cvss-calculator.util.js';
import type { CvssVectorComponents } from '@pentesthub/shared';

describe('calculateCvss', () => {
  // Known-answer test vectors — cross-checked against the published
  // FIRST.org CVSS 3.1 calculator (https://www.first.org/cvss/calculator/3.1)
  // and NVD's own published CVSS 3.1 scores for well-known CVEs.

  it('scores a textbook critical (unauthenticated RCE, scope unchanged) as 9.8', () => {
    // AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H — e.g. Log4Shell-shaped vector.
    const components: CvssVectorComponents = { AV: 'N', AC: 'L', PR: 'N', UI: 'N', S: 'U', C: 'H', I: 'H', A: 'H' };
    const result = calculateCvss(components);
    expect(result.score).toBe(9.8);
    expect(result.severity).toBe('CRITICAL');
    expect(result.vector).toBe('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H');
  });

  it('scores a scope-changed critical (e.g. container escape) as 10.0', () => {
    const components: CvssVectorComponents = { AV: 'N', AC: 'L', PR: 'N', UI: 'N', S: 'C', C: 'H', I: 'H', A: 'H' };
    const result = calculateCvss(components);
    expect(result.score).toBe(10.0);
    expect(result.severity).toBe('CRITICAL');
  });

  it('scores a low-impact, high-friction finding as Low', () => {
    // AV:P/AC:H/PR:H/UI:R/S:U/C:L/I:N/A:N — physical access, high
    // complexity, requires privileges + user interaction, low confidentiality
    // impact only.
    const components: CvssVectorComponents = { AV: 'P', AC: 'H', PR: 'H', UI: 'R', S: 'U', C: 'L', I: 'N', A: 'N' };
    const result = calculateCvss(components);
    expect(result.score).toBeLessThan(4.0);
    expect(result.severity).toBe('LOW');
  });

  it('scores an info-disclosure-only reflected XSS (scope changed) in the Medium band', () => {
    // AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N — classic reflected XSS shape.
    const components: CvssVectorComponents = { AV: 'N', AC: 'L', PR: 'N', UI: 'R', S: 'C', C: 'L', I: 'L', A: 'N' };
    const result = calculateCvss(components);
    expect(result.score).toBeGreaterThanOrEqual(4.0);
    expect(result.score).toBeLessThan(7.0);
    expect(result.severity).toBe('MEDIUM');
  });

  it('scores all-none impact as exactly 0.0 / INFO regardless of exploitability', () => {
    const components: CvssVectorComponents = { AV: 'N', AC: 'L', PR: 'N', UI: 'N', S: 'U', C: 'N', I: 'N', A: 'N' };
    const result = calculateCvss(components);
    expect(result.score).toBe(0);
    expect(result.severity).toBe('INFO');
  });

  it('round-trips through cvssVectorString/parseCvssVector', () => {
    const components: CvssVectorComponents = { AV: 'A', AC: 'H', PR: 'L', UI: 'R', S: 'C', C: 'H', I: 'N', A: 'L' };
    const vector = cvssVectorString(components);
    const parsed = parseCvssVector(vector);
    expect(parsed).toEqual(components);
  });

  it('parseCvssVector returns null for a malformed or non-3.1 vector', () => {
    expect(parseCvssVector('not a vector')).toBeNull();
    expect(parseCvssVector('CVSS:3.0/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H')).toBeNull();
    expect(parseCvssVector('CVSS:3.1/AV:N/AC:L')).toBeNull();
  });
});

describe('severityForCvssScore', () => {
  it('maps the FIRST.org qualitative severity rating scale boundaries correctly', () => {
    expect(severityForCvssScore(0)).toBe('INFO');
    expect(severityForCvssScore(0.1)).toBe('LOW');
    expect(severityForCvssScore(3.9)).toBe('LOW');
    expect(severityForCvssScore(4.0)).toBe('MEDIUM');
    expect(severityForCvssScore(6.9)).toBe('MEDIUM');
    expect(severityForCvssScore(7.0)).toBe('HIGH');
    expect(severityForCvssScore(8.9)).toBe('HIGH');
    expect(severityForCvssScore(9.0)).toBe('CRITICAL');
    expect(severityForCvssScore(10.0)).toBe('CRITICAL');
  });
});
