import { describe, expect, it } from '@jest/globals';
import {
  certificateDedupKey,
  dnsRecordDedupKey,
  httpHeaderDedupKey,
  normalizeHostname,
  normalizeUrl,
  openPortDedupKey,
  screenshotDedupKey,
  securityHeaderDedupKey,
  serviceDedupKey,
  subdomainDedupKey,
  technologyDedupKey,
} from './dedup-key.util.js';

describe('dedup-key.util', () => {
  it('normalizes hostnames (lowercase, trailing dot stripped)', () => {
    expect(normalizeHostname('Example.COM.')).toBe('example.com');
    expect(subdomainDedupKey('API.example.com')).toBe('api.example.com');
  });

  it('normalizes URLs (lowercase scheme+host, default port stripped, trailing slash stripped)', () => {
    expect(normalizeUrl('HTTPS://Example.com:443/Path/')).toBe(
      'https://example.com/Path',
    );
    expect(normalizeUrl('http://example.com:80/')).toBe('http://example.com/');
    expect(normalizeUrl('http://example.com:8080/x')).toBe(
      'http://example.com:8080/x',
    );
  });

  it('falls back to a lowercased/trimmed string when the input is not a parseable URL', () => {
    expect(normalizeUrl('not-a-valid-url/')).toBe('not-a-valid-url');
  });

  it('keys open ports by ip:port/protocol, treating tcp/udp as distinct', () => {
    const tcp = openPortDedupKey('1.2.3.4', 53, 'tcp');
    const udp = openPortDedupKey('1.2.3.4', 53, 'udp');
    expect(tcp).toBe('1.2.3.4:53/tcp');
    expect(udp).toBe('1.2.3.4:53/udp');
    expect(tcp).not.toBe(udp);
  });

  it('keys services off the same ip:port/protocol as open ports', () => {
    expect(serviceDedupKey('1.2.3.4', 443, 'tcp')).toBe(
      '1.2.3.4:443/tcp:service',
    );
  });

  it('keys technologies by normalized host + lowercased tech name', () => {
    expect(technologyDedupKey('Example.com', 'Nginx')).toBe(
      'example.com:nginx',
    );
  });

  it('keys DNS records by hostname + record type + normalized value', () => {
    expect(dnsRecordDedupKey('Example.com', 'a', '93.184.216.34')).toBe(
      'example.com:A:93.184.216.34',
    );
  });

  it('excludes the header VALUE from the HTTP_HEADER key so a value change updates, not duplicates', () => {
    const key1 = httpHeaderDedupKey('example.com', 'Server');
    const key2 = httpHeaderDedupKey('example.com', 'server');
    expect(key1).toBe(key2);
    expect(key1).toBe('example.com:server');
  });

  it('namespaces security headers separately from regular headers', () => {
    const regular = httpHeaderDedupKey('example.com', 'X-Frame-Options');
    const security = securityHeaderDedupKey('example.com', 'X-Frame-Options');
    expect(regular).not.toBe(security);
  });

  it('keys certificates by host:port + a fingerprint-or-issuer fallback', () => {
    expect(certificateDedupKey('example.com', 443, 'sha256:abc')).toBe(
      'example.com:443:cert:sha256:abc',
    );
  });

  it('keys screenshots by the same normalization as URLs', () => {
    expect(screenshotDedupKey('HTTPS://Example.com/')).toBe(
      normalizeUrl('https://Example.com/'),
    );
    expect(screenshotDedupKey('HTTPS://Example.com/')).toBe(
      'https://example.com/',
    );
  });
});
