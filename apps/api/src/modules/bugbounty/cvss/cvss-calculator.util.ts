import type { CalculateCvssResultDto, CvssVectorComponents, VulnFindingSeverity } from '@pentesthub/shared';

/// CVSS 3.1 base-score calculator — implements the official FIRST.org
/// CVSS v3.1 specification's base-metric formula exactly (section 7.1 of
/// the spec: https://www.first.org/cvss/v3.1/specification-document).
/// Pure and dependency-free by design: this is the one piece of Module 9
/// math that has an authoritative, checkable answer for known test
/// vectors (see cvss-calculator.util.spec.ts), so it's kept isolated from
/// NestJS/Prisma to stay trivially unit-testable and reusable from the
/// Desktop Agent's Rust port later if that's ever needed (the formula
/// below is a direct, line-for-line port target).

const AV_WEIGHTS: Record<CvssVectorComponents['AV'], number> = { N: 0.85, A: 0.62, L: 0.55, P: 0.2 };
const AC_WEIGHTS: Record<CvssVectorComponents['AC'], number> = { L: 0.77, H: 0.44 };
const PR_WEIGHTS_UNCHANGED: Record<CvssVectorComponents['PR'], number> = { N: 0.85, L: 0.62, H: 0.27 };
const PR_WEIGHTS_CHANGED: Record<CvssVectorComponents['PR'], number> = { N: 0.85, L: 0.68, H: 0.5 };
const UI_WEIGHTS: Record<CvssVectorComponents['UI'], number> = { N: 0.85, R: 0.62 };
const CIA_WEIGHTS: Record<CvssVectorComponents['C'], number> = { H: 0.56, L: 0.22, N: 0 };

/// CVSS spec's exact "Roundup" function (section 7.1): round a base
/// score up to one decimal place, but using the spec's specific
/// integer-scaled algorithm rather than naive `Math.ceil(x * 10) / 10`,
/// which the spec explicitly warns produces different (wrong) results
/// for some inputs due to floating-point representation.
function roundUp(input: number): number {
  const intInput = Math.round(input * 100000);
  if (intInput % 10000 === 0) {
    return intInput / 100000;
  }
  return (Math.floor(intInput / 10000) + 1) / 10;
}

export function severityForCvssScore(score: number): VulnFindingSeverity {
  if (score <= 0) return 'INFO';
  if (score < 4.0) return 'LOW';
  if (score < 7.0) return 'MEDIUM';
  if (score < 9.0) return 'HIGH';
  return 'CRITICAL';
}

export function cvssVectorString(c: CvssVectorComponents): string {
  return `CVSS:3.1/AV:${c.AV}/AC:${c.AC}/PR:${c.PR}/UI:${c.UI}/S:${c.S}/C:${c.C}/I:${c.I}/A:${c.A}`;
}

/// Parses a `CVSS:3.1/AV:N/AC:L/...` vector string back into components
/// — the inverse of `cvssVectorString`, used when a finding/report only
/// has `cvssVector` stored (e.g. imported from a platform) and the
/// calculator UI needs to pre-fill from it.
export function parseCvssVector(vector: string): CvssVectorComponents | null {
  const parts = vector.trim().split('/');
  if (parts[0] !== 'CVSS:3.1') return null;
  const map = new Map<string, string>();
  for (const part of parts.slice(1)) {
    const [key, value] = part.split(':');
    if (key && value) map.set(key, value);
  }
  const required = ['AV', 'AC', 'PR', 'UI', 'S', 'C', 'I', 'A'];
  for (const key of required) {
    if (!map.has(key)) return null;
  }
  return {
    AV: map.get('AV') as CvssVectorComponents['AV'],
    AC: map.get('AC') as CvssVectorComponents['AC'],
    PR: map.get('PR') as CvssVectorComponents['PR'],
    UI: map.get('UI') as CvssVectorComponents['UI'],
    S: map.get('S') as CvssVectorComponents['S'],
    C: map.get('C') as CvssVectorComponents['C'],
    I: map.get('I') as CvssVectorComponents['I'],
    A: map.get('A') as CvssVectorComponents['A'],
  };
}

export function calculateCvss(components: CvssVectorComponents): CalculateCvssResultDto {
  const { AV, AC, PR, UI, S, C, I, A } = components;
  const scopeChanged = S === 'C';

  const iscBase = 1 - (1 - CIA_WEIGHTS[C]) * (1 - CIA_WEIGHTS[I]) * (1 - CIA_WEIGHTS[A]);
  const isc = scopeChanged
    ? 7.52 * (iscBase - 0.029) - 3.25 * Math.pow(iscBase - 0.02, 15)
    : 6.42 * iscBase;

  const prWeight = scopeChanged ? PR_WEIGHTS_CHANGED[PR] : PR_WEIGHTS_UNCHANGED[PR];
  const exploitability = 8.22 * AV_WEIGHTS[AV] * AC_WEIGHTS[AC] * prWeight * UI_WEIGHTS[UI];

  let score: number;
  if (isc <= 0) {
    score = 0;
  } else if (scopeChanged) {
    score = roundUp(Math.min(1.08 * (isc + exploitability), 10));
  } else {
    score = roundUp(Math.min(isc + exploitability, 10));
  }

  return {
    score,
    severity: severityForCvssScore(score),
    vector: cvssVectorString(components),
    components,
  };
}
