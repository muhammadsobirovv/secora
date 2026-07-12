import { describe, expect, it } from '@jest/globals';
import { GauNormalizer } from './gau.normalizer.js';

describe('GauNormalizer', () => {
  it('parses newline-delimited URLs into URL findings', () => {
    const raw = [
      'http://example.com/old-page?id=1',
      'http://example.com/old-page?id=2',
      '',
    ].join('\n');

    const findings = new GauNormalizer().normalize(raw);

    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({
      type: 'URL',
      data: { source: 'gau' },
    });
  });

  it('returns an empty array for empty output', () => {
    expect(new GauNormalizer().normalize('')).toEqual([]);
  });
});
