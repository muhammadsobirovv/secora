import { describe, expect, it } from '@jest/globals';
import { assertSafeWebhookUrl, isPrivateIpv4, isPrivateIpv6 } from './ssrf-guard.util.js';
import { AppException } from '../exceptions/app.exception.js';

describe('isPrivateIpv4', () => {
  it('flags loopback, RFC1918, and link-local (cloud metadata) addresses as private', () => {
    expect(isPrivateIpv4('127.0.0.1')).toBe(true);
    expect(isPrivateIpv4('10.0.0.1')).toBe(true);
    expect(isPrivateIpv4('172.16.5.4')).toBe(true);
    expect(isPrivateIpv4('192.168.1.1')).toBe(true);
    expect(isPrivateIpv4('169.254.169.254')).toBe(true); // cloud metadata endpoint
    expect(isPrivateIpv4('0.0.0.0')).toBe(true);
  });

  it('does not flag ordinary public addresses', () => {
    expect(isPrivateIpv4('8.8.8.8')).toBe(false);
    expect(isPrivateIpv4('1.1.1.1')).toBe(false);
    expect(isPrivateIpv4('93.184.216.34')).toBe(false);
  });

  it('fails closed on malformed input', () => {
    expect(isPrivateIpv4('not-an-ip')).toBe(true);
    expect(isPrivateIpv4('999.999.999.999')).toBe(true);
  });
});

describe('isPrivateIpv6', () => {
  it('flags loopback, unique-local, and link-local addresses as private', () => {
    expect(isPrivateIpv6('::1')).toBe(true);
    expect(isPrivateIpv6('fe80::1')).toBe(true);
    expect(isPrivateIpv6('fc00::1')).toBe(true);
    expect(isPrivateIpv6('fd00::1')).toBe(true);
  });

  it('unwraps IPv4-mapped IPv6 addresses and checks the embedded IPv4', () => {
    expect(isPrivateIpv6('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateIpv6('::ffff:8.8.8.8')).toBe(false);
  });

  it('does not flag an ordinary public IPv6 address', () => {
    expect(isPrivateIpv6('2001:4860:4860::8888')).toBe(false);
  });
});

describe('assertSafeWebhookUrl', () => {
  it('rejects non-http(s) protocols before any DNS lookup', async () => {
    await expect(assertSafeWebhookUrl('ftp://example.com/hook')).rejects.toBeInstanceOf(AppException);
  });

  it('rejects a malformed URL', async () => {
    await expect(assertSafeWebhookUrl('not a url')).rejects.toMatchObject({ code: 'UNSAFE_WEBHOOK_URL' });
  });

  it('rejects the literal "localhost" hostname without needing DNS', async () => {
    await expect(assertSafeWebhookUrl('http://localhost/hook')).rejects.toMatchObject({
      code: 'UNSAFE_WEBHOOK_URL',
    });
  });
});
