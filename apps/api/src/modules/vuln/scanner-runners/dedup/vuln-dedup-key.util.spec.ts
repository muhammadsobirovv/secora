import { describe, expect, it } from '@jest/globals';
import { normalizePath, vulnFindingDedupKey } from './vuln-dedup-key.util.js';

describe('vuln-dedup-key.util', () => {
  it('normalizes a bare path (trailing slash stripped, sorted query keys)', () => {
    expect(normalizePath('/admin/')).toBe('/admin');
    expect(normalizePath('/search?b=1&a=2')).toBe('/search?a,b');
  });

  it('normalizes a full URL down to its path', () => {
    expect(normalizePath('https://example.com/Admin/')).toBe('/Admin');
  });

  it('defaults a null path to "/"', () => {
    expect(normalizePath(null)).toBe('/');
  });

  it('falls back to a lowercased/trimmed string for a non-parseable value', () => {
    expect(normalizePath('http://')).toBe('http://');
  });

  it('combines path + vulnType + signature into one key, case/whitespace-insensitively', () => {
    const key1 = vulnFindingDedupKey(
      '/admin',
      'Exposed-Panel',
      'nuclei-template-1',
    );
    const key2 = vulnFindingDedupKey(
      '/admin/',
      ' exposed-panel ',
      'NUCLEI-TEMPLATE-1',
    );
    expect(key1).toBe(key2);
  });

  it('produces different keys for different vulnType/signature on the same path', () => {
    const key1 = vulnFindingDedupKey('/admin', 'xss', 'sig-a');
    const key2 = vulnFindingDedupKey('/admin', 'xss', 'sig-b');
    expect(key1).not.toBe(key2);
  });
});
