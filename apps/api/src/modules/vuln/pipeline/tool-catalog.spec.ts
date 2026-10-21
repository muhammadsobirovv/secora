import { describe, expect, it } from '@jest/globals';
import {
  assertSafeHost,
  assertSafeUrl,
  buildHttpxArgs,
  buildNucleiArgs,
  toolsForProfile,
  TOOL_CATALOG,
  NUCLEI_PROFILES,
} from './tool-catalog.js';

describe('tool-catalog — host and URL validation', () => {
  it('accepts plain hostnames and normalizes case and trailing dot', () => {
    expect(assertSafeHost('Shop.Example.ORG.')).toBe('shop.example.org');
  });

  it('rejects flag-like, credentialed, spaced and metacharacter inputs', () => {
    for (const bad of [
      '-oX',
      'example.org -o /tmp/x',
      'a.com;rm -rf /',
      '$(id).example.org',
      'user@example.org',
      'localhost',
      '',
    ]) {
      expect(() => assertSafeHost(bad)).toThrow(/not a valid hostname/);
    }
  });

  it('allows only http(s) URLs without credentials', () => {
    expect(assertSafeUrl('https://shop.example.org/app')).toBe('https://shop.example.org/app');
    expect(() => assertSafeUrl('file:///etc/passwd')).toThrow(/only http/);
    expect(() => assertSafeUrl('https://user:pw@shop.example.org')).toThrow(/credentials/);
  });
});

describe('tool-catalog — httpx argv', () => {
  it('is an argv array with the target as its own element and never follows redirects', () => {
    const args = buildHttpxArgs({ target: 'shop.example.org' });
    expect(args[0]).toBe('-u');
    expect(args[1]).toBe('shop.example.org');
    expect(args).not.toContain('-fr');
    expect(args).not.toContain('-follow-redirects');
    expect(args.every((a) => !a.includes(' '))).toBe(true);
  });

  it('caps the request rate and timeout', () => {
    const args = buildHttpxArgs({ target: 'https://shop.example.org' });
    expect(args[args.indexOf('-rl') + 1]).toBe('50');
    expect(args[args.indexOf('-timeout') + 1]).toBe('10');
  });
});

describe('tool-catalog — nuclei argv', () => {
  it('gives a bare domain both the host and the https form', () => {
    const args = buildNucleiArgs({
      target: { kind: 'DOMAIN', value: 'shop.example.org' },
      profile: 'QUICK',
    });
    const targets = args.filter((_, i) => args[i - 1] === '-u');
    expect(targets).toEqual(['shop.example.org', 'https://shop.example.org']);
  });

  it('disables out-of-band callbacks (-ni) and the update check (-duc)', () => {
    const args = buildNucleiArgs({
      target: { kind: 'URL', value: 'https://shop.example.org' },
      profile: 'STANDARD',
    });
    expect(args).toContain('-ni');
    expect(args).toContain('-duc');
  });

  it('a job config can narrow the profile tags but never widen them', () => {
    const widened = buildNucleiArgs({
      target: { kind: 'URL', value: 'https://shop.example.org' },
      profile: 'QUICK',
      tags: ['exposures', 'brute-force'],
    });
    expect(widened[widened.indexOf('-tags') + 1]).toBe('exposures');
  });

  it('refuses a narrowing that leaves no tags, instead of running every template', () => {
    expect(() =>
      buildNucleiArgs({
        target: { kind: 'URL', value: 'https://shop.example.org' },
        profile: 'QUICK',
        tags: ['cves'], // outside QUICK's set
      }),
    ).toThrow(/No nuclei template tags/);
  });

  it('never includes brute-force, fuzzing or intrusive tags in any profile', () => {
    for (const profile of ['QUICK', 'STANDARD', 'DEEP'] as const) {
      expect(NUCLEI_PROFILES[profile].tags.join(',')).not.toMatch(/brute|fuzz|dos|sqli|intrusive/);
    }
  });

  it('rate-limits per profile', () => {
    const args = buildNucleiArgs({
      target: { kind: 'URL', value: 'https://shop.example.org' },
      profile: 'STANDARD',
    });
    expect(args[args.indexOf('-rl') + 1]).toBe(String(NUCLEI_PROFILES.STANDARD.rateLimit));
  });
});

describe('tool-catalog — profiles and entries', () => {
  it('DEEP is refused unless the feature flag is on', () => {
    expect(() => toolsForProfile('DEEP', { deepEnabled: false })).toThrow(/not enabled/);
    expect(toolsForProfile('DEEP', { deepEnabled: true }).map((t) => t.id).sort()).toEqual([
      'httpx',
      'nuclei',
    ]);
  });

  it('QUICK runs httpx and nuclei; no entry is intrusive', () => {
    expect(toolsForProfile('QUICK', { deepEnabled: false }).map((t) => t.id).sort()).toEqual([
      'httpx',
      'nuclei',
    ]);
    for (const entry of Object.values(TOOL_CATALOG)) {
      expect(entry.riskLevel).not.toBe('INTRUSIVE');
    }
  });
});
