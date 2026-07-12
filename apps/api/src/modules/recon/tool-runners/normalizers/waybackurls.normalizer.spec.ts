import { describe, expect, it } from '@jest/globals';
import { WaybackurlsNormalizer } from './waybackurls.normalizer.js';

describe('WaybackurlsNormalizer', () => {
  it('parses newline-delimited URLs into URL findings', () => {
    const raw = [
      'http://example.com/2019/page.html',
      'http://example.com/2020/page.html',
      '',
    ].join('\n');

    const findings = new WaybackurlsNormalizer().normalize(raw);

    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({
      type: 'URL',
      data: { source: 'waybackurls' },
    });
  });

  it('returns an empty array for empty output', () => {
    expect(new WaybackurlsNormalizer().normalize('')).toEqual([]);
  });
});
