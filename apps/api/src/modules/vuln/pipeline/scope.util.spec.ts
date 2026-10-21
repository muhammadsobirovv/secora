import { describe, expect, it } from '@jest/globals';
import { isWithinApex, partitionByApex } from './scope.util.js';

describe('scope — subdomain expansion stays inside the verified apex', () => {
  it('accepts the apex and its subdomains', () => {
    expect(isWithinApex('example.org', 'example.org')).toBe(true);
    expect(isWithinApex('a.b.example.org', 'example.org')).toBe(true);
  });

  it('refuses lookalike suffixes and sibling domains', () => {
    expect(isWithinApex('evilexample.org', 'example.org')).toBe(false);
    expect(isWithinApex('example.org.evil.net', 'example.org')).toBe(false);
    expect(isWithinApex('other.org', 'example.org')).toBe(false);
  });

  it('partitions discovered hosts, records reasons, dedupes and normalizes case', () => {
    const result = partitionByApex(
      ['API.Example.org', 'api.example.org.', 'evilexample.org', 'cdn.partner.net', '-oX', 'mail.example.org'],
      'example.org',
    );
    expect(result.inScope).toEqual(['api.example.org', 'mail.example.org']);
    expect(result.skipped).toEqual([
      { host: 'evilexample.org', reason: 'OUTSIDE_VERIFIED_APEX' },
      { host: 'cdn.partner.net', reason: 'OUTSIDE_VERIFIED_APEX' },
      { host: '-oX', reason: 'INVALID_HOST' },
    ]);
  });
});
