import { describe, expect, it } from '@jest/globals';
import { AmassNormalizer } from './amass.normalizer.js';

describe('AmassNormalizer', () => {
  it('parses newline-delimited hostnames into SUBDOMAIN findings', () => {
    const raw = ['api.example.com', 'www.example.com', ''].join('\n');

    const findings = new AmassNormalizer().normalize(raw);

    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({
      type: 'SUBDOMAIN',
      value: 'api.example.com',
      dedupKey: 'api.example.com',
      data: { source: 'amass' },
    });
    expect(findings[1]?.value).toBe('www.example.com');
  });

  it('skips blank lines', () => {
    const raw = '\n  \napi.example.com\n\n';
    const findings = new AmassNormalizer().normalize(raw);
    expect(findings).toHaveLength(1);
  });

  it('returns an empty array for empty output', () => {
    expect(new AmassNormalizer().normalize('')).toEqual([]);
  });
});
