import { describe, expect, it } from '@jest/globals';
import { FfufNormalizer } from './ffuf.normalizer.js';
import type { Normalizer } from './normalizer.interface.js';

// Typed as the `Normalizer` interface — see dirsearch.normalizer.spec.ts's
// identical comment.
const normalizer: Normalizer = new FfufNormalizer();

describe('FfufNormalizer', () => {
  it('parses the end-of-run JSON document into MEDIUM-severity findings for sensitive paths', () => {
    const raw = JSON.stringify({
      results: [
        {
          input: { FUZZ: 'admin' },
          status: 200,
          length: 1234,
          words: 10,
          lines: 5,
          'content-type': 'text/html',
          url: 'http://example.com/admin',
        },
        {
          input: { FUZZ: 'images' },
          status: 200,
          length: 500,
          url: 'http://example.com/images',
        },
        {
          input: { FUZZ: 'old' },
          status: 301,
          redirectlocation: '/new',
          url: 'http://example.com/old',
        },
      ],
    });

    const findings = normalizer.normalize(raw, {
      scanner: 'FFUF',
      targetValue: 'http://example.com',
    });

    expect(findings).toHaveLength(3);
    expect(findings[0]).toMatchObject({
      severity: 'MEDIUM',
      path: '/admin',
      vulnType: 'exposed-content',
    });
    expect(findings[1]).toMatchObject({
      severity: 'LOW',
      path: '/images',
      vulnType: 'exposed-content',
    });
    expect(findings[2]).toMatchObject({
      severity: 'INFO',
      path: '/old',
      vulnType: 'exposed-redirect',
    });
  });

  it('returns no findings for malformed JSON', () => {
    expect(
      normalizer.normalize('not json', {
        scanner: 'FFUF',
        targetValue: 'x',
      }),
    ).toEqual([]);
  });

  it('skips entries with a zero/missing status', () => {
    const raw = JSON.stringify({
      results: [{ input: { FUZZ: 'x' }, url: 'http://example.com/x' }],
    });
    expect(
      normalizer.normalize(raw, {
        scanner: 'FFUF',
        targetValue: 'x',
      }),
    ).toEqual([]);
  });
});
