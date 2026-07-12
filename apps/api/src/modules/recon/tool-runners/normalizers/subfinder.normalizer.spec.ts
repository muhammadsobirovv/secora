import { describe, expect, it } from '@jest/globals';
import { SubfinderNormalizer } from './subfinder.normalizer.js';

describe('SubfinderNormalizer', () => {
  it('parses JSONL output into SUBDOMAIN findings', () => {
    const raw = [
      '{"host":"api.example.com","input":"example.com","source":"crtsh"}',
      '{"host":"www.example.com","input":"example.com","source":"virustotal"}',
      '',
    ].join('\n');

    const findings = new SubfinderNormalizer().normalize(raw);

    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({
      type: 'SUBDOMAIN',
      value: 'api.example.com',
      dedupKey: 'api.example.com',
    });
    expect(findings[1]?.value).toBe('www.example.com');
  });

  it('skips malformed lines instead of throwing', () => {
    const raw = 'not json\n{"host":"api.example.com"}\n{broken';
    const findings = new SubfinderNormalizer().normalize(raw);
    expect(findings).toHaveLength(1);
  });
});
