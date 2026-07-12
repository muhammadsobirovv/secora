import { describe, expect, it } from '@jest/globals';
import { AssetfinderNormalizer } from './assetfinder.normalizer.js';

describe('AssetfinderNormalizer', () => {
  it('parses plain-text, one-hostname-per-line output into SUBDOMAIN findings', () => {
    const raw = 'api.example.com\nwww.example.com\n\nexample.com\n';
    const findings = new AssetfinderNormalizer().normalize(raw);

    expect(findings).toHaveLength(3);
    expect(findings.map((f) => f.value)).toEqual([
      'api.example.com',
      'www.example.com',
      'example.com',
    ]);
    expect(findings[0]?.type).toBe('SUBDOMAIN');
  });
});
