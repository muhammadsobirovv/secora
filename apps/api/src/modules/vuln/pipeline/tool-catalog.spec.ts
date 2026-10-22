import { describe, expect, it } from '@jest/globals';
import {
  assertSafeHost,
  assertSafeUrl,
  buildDalfoxArgs,
  buildDnsxArgs,
  buildFfufArgs,
  buildHttpxArgs,
  buildKatanaArgs,
  buildNaabuArgs,
  buildNucleiArgs,
  buildSubfinderArgs,
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
      profile: 'STANDARD',
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
      profile: 'STANDARD',
      tags: ['exposure', 'brute-force'],
    });
    expect(widened[widened.indexOf('-tags') + 1]).toBe('exposure');
  });

  it('refuses a narrowing that leaves no tags, instead of running every template', () => {
    expect(() =>
      buildNucleiArgs({
        target: { kind: 'URL', value: 'https://shop.example.org' },
        profile: 'STANDARD',
        tags: ['brute-force'], // outside STANDARD's set
      }),
    ).toThrow(/No nuclei template tags/);
  });

  it('never includes brute-force, fuzzing or intrusive tags in any profile', () => {
    for (const profile of ['STANDARD', 'DEEP'] as const) {
      expect(NUCLEI_PROFILES[profile].tags.join(',')).not.toMatch(/brute|fuzz|dos|sqli|intrusive/);
    }
  });

  it('blocks local-network access and risky protocol types on every run', () => {
    for (const profile of ['STANDARD', 'DEEP'] as const) {
      const args = buildNucleiArgs({
        target: { kind: 'URL', value: 'https://shop.example.org' },
        profile,
      });
      expect(args).toContain('-lna');
      expect(args[args.indexOf('-ept') + 1]).toBe('code,file,headless,javascript,websocket,whois');
      expect(args).not.toContain('-lfa');
    }
  });

  it('lifts the local-network block only when asked to explicitly', () => {
    const base = { target: { kind: 'URL' as const, value: 'https://shop.example.org' } };
    expect(buildNucleiArgs({ ...base, restrictLocalNetwork: false })).not.toContain('-lna');
    expect(buildNucleiArgs({ ...base, restrictLocalNetwork: true })).toContain('-lna');
    expect(buildNucleiArgs(base)).toContain('-lna');
  });

  it('default-login runs only in DEEP', () => {
    expect(NUCLEI_PROFILES.STANDARD.tags).not.toContain('default-login');
    expect(NUCLEI_PROFILES.DEEP.tags).toContain('default-login');
    const standard = buildNucleiArgs({
      target: { kind: 'URL', value: 'https://shop.example.org' },
      profile: 'STANDARD',
      tags: ['default-login', 'exposure'],
    });
    expect(standard[standard.indexOf('-tags') + 1]).toBe('exposure');
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
    expect(toolsForProfile('DEEP', { deepEnabled: true }).length).toBeGreaterThan(2);
  });
});

describe('nuclei behind the pinning proxy', () => {
  const proxy = 'http://127.0.0.1:41234';
  const flagValue = (args: string[], flag: string) => args[args.indexOf(flag) + 1];

  it('gets real hostnames and the proxy, runs only HTTP templates, and drops the IP + Host-header pin', () => {
    const args = buildNucleiArgs({
      target: { kind: 'DOMAIN', value: 'shop.example.org' },
      profile: 'STANDARD',
      pin: { host: 'shop.example.org', ip: '93.184.216.34', family: 4 },
      urls: ['https://shop.example.org/', 'https://shop.example.org/a?b=1'],
      proxyUrl: proxy,
    });
    expect(args.filter((_, i) => args[i - 1] === '-u')).toEqual(['https://shop.example.org/', 'https://shop.example.org/a?b=1']);
    expect(flagValue(args, '-proxy')).toBe(proxy);
    expect(flagValue(args, '-pt')).toBe('http');
    for (const unwanted of ['-H', '-sni']) expect(args).not.toContain(unwanted);
    expect(args.join(' ')).not.toContain('93.184.216.34');
    // -lna would make nuclei refuse the loopback proxy itself.
    expect(args).not.toContain('-lna');
    expect(args).toEqual(expect.arrayContaining(['-ni', '-duc']));
    expect(flagValue(args, '-ept')).toBe('code,file,headless,javascript,websocket,whois');
  });

  it('falls back to the target when no URL list is given, and refuses another proxy', () => {
    const args = buildNucleiArgs({ target: { kind: 'DOMAIN', value: 'Shop.Example.org' }, profile: 'STANDARD', proxyUrl: proxy });
    expect(args.filter((_, i) => args[i - 1] === '-u')).toEqual(['https://shop.example.org', 'http://shop.example.org']);
    expect(() =>
      buildNucleiArgs({ target: { kind: 'DOMAIN', value: 'shop.example.org' }, profile: 'STANDARD', proxyUrl: 'http://evil.test:8080' }),
    ).toThrow(/pinning proxy/);
    expect(() =>
      buildNucleiArgs({ target: { kind: 'DOMAIN', value: 'shop.example.org' }, profile: 'STANDARD', urls: ['http://127.0.0.1/x'], proxyUrl: proxy }),
    ).toThrow();
  });

  it('without a proxy the pinned IP path is unchanged', () => {
    const args = buildNucleiArgs({
      target: { kind: 'DOMAIN', value: 'shop.example.org' },
      profile: 'STANDARD',
      pin: { host: 'shop.example.org', ip: '93.184.216.34', family: 4 },
    });
    expect(args).toEqual(expect.arrayContaining(['-H', 'Host: shop.example.org', '-sni', 'shop.example.org', '-lna']));
    expect(args).not.toContain('-proxy');
  });
});

describe('Stage 3 argv builders', () => {
  const proxy = 'http://127.0.0.1:41234';
  const flagValue = (args: string[], flag: string) => args[args.indexOf(flag) + 1];

  it('katana: depth 2, one FQDN, no redirects, no headless, capped, through the proxy', () => {
    const args = buildKatanaArgs({ url: 'https://shop.example.org', proxyUrl: proxy });
    expect(args.slice(0, 2)).toEqual(['-u', 'https://shop.example.org']);
    expect(flagValue(args, '-d')).toBe('2');
    expect(flagValue(args, '-fs')).toBe('fqdn');
    expect(flagValue(args, '-mdp')).toBe('200');
    expect(flagValue(args, '-proxy')).toBe(proxy);
    expect(args).toEqual(expect.arrayContaining(['-dr', '-jc', '-jsonl', '-silent']));
    for (const forbidden of ['-hl', '-headless', '-hh', '-hybrid', '-ns', '-no-scope', '-aff', '-jsl', '-kb-validate-secrets']) {
      expect(args).not.toContain(forbidden);
    }
  });

  it('subfinder: passive only', () => {
    const args = buildSubfinderArgs({ domain: 'Example.org.' });
    expect(args.slice(0, 2)).toEqual(['-d', 'example.org']);
    for (const forbidden of ['-all', '-nW', '-active', '-recursive']) expect(args).not.toContain(forbidden);
    expect(args).toEqual(expect.arrayContaining(['-silent', '-duc']));
  });

  it('dnsx: comma list of validated hosts, A and AAAA, system hosts file never used', () => {
    const args = buildDnsxArgs({ hosts: ['a.example.org', 'B.example.org'] });
    expect(flagValue(args, '-l')).toBe('a.example.org,b.example.org');
    expect(args).toEqual(expect.arrayContaining(['-a', '-aaaa', '-j']));
    for (const forbidden of ['-hf', '-hostsfile', '-axfr', '-all', '-recon', '-trace']) expect(args).not.toContain(forbidden);
    expect(() => buildDnsxArgs({ hosts: [] })).toThrow();
    expect(() => buildDnsxArgs({ hosts: ['-evil.example.org'] })).toThrow(/not a valid hostname/);
    expect(() => buildDnsxArgs({ hosts: Array.from({ length: 151 }, (_, i) => `h${i}.example.org`) })).toThrow(/Too many/);
  });

  it('naabu: top 100 ports, connect scan, low rate, no passive or nmap', () => {
    const args = buildNaabuArgs({ ips: ['93.184.216.34', '2001:4860:4860::8888'] });
    expect(flagValue(args, '-host')).toBe('93.184.216.34,2001:4860:4860::8888');
    expect(flagValue(args, '-top-ports')).toBe('100');
    expect(flagValue(args, '-s')).toBe('c');
    expect(Number(flagValue(args, '-rate'))).toBeLessThanOrEqual(100);
    expect(args).toEqual(expect.arrayContaining(['-Pn', '-exclude-cdn', '-no-stdin']));
    for (const forbidden of ['-passive', '-nmap', '-nmap-cli', '-sD', '-sV', '-sa', '-scan-all-ips', '-list', '-l']) {
      expect(args).not.toContain(forbidden);
    }
    expect(() => buildNaabuArgs({ ips: ['shop.example.org'] })).toThrow(/not an IP/);
    expect(() => buildNaabuArgs({ ips: ['--top-ports'] })).toThrow();
    expect(() => buildNaabuArgs({ ips: [] })).toThrow();
    expect(() => buildNaabuArgs({ ips: Array.from({ length: 21 }, (_, i) => `93.184.216.${i + 1}`) })).toThrow(/Too many/);
  });

  it('ffuf: one FUZZ at the root, calibrated, rate limited, no recursion, no redirects', () => {
    const args = buildFfufArgs({ origin: 'https://shop.example.org/anything?x=1', wordlistPath: '/tmp/secora/words.txt', proxyUrl: proxy });
    expect(flagValue(args, '-u')).toBe('https://shop.example.org/FUZZ');
    expect(flagValue(args, '-w')).toBe('/tmp/secora/words.txt');
    expect(flagValue(args, '-x')).toBe(proxy);
    expect(args).toEqual(expect.arrayContaining(['-ac', '-sf', '-noninteractive', '-json']));
    expect(Number(flagValue(args, '-rate'))).toBeLessThanOrEqual(20);
    expect(Number(flagValue(args, '-maxtime'))).toBeLessThanOrEqual(180);
    for (const forbidden of ['-recursion', '-recursion-depth', '-r', '-replay-proxy', '-input-cmd', '-request', '-X', '-d']) {
      expect(args).not.toContain(forbidden);
    }
    expect(() => buildFfufArgs({ origin: 'https://shop.example.org', wordlistPath: 'relative.txt', proxyUrl: proxy })).toThrow(/absolute/);
  });

  it('dalfox: detection only, no blind callbacks, no remote or custom payloads', () => {
    const args = buildDalfoxArgs({ urls: ['https://shop.example.org/search?q=a', 'https://shop.example.org/p?id=1&x=2'], proxyUrl: proxy });
    expect(args.slice(0, 3)).toEqual(['scan', '-i', 'url']);
    expect(flagValue(args, '--proxy')).toBe(proxy);
    expect(flagValue(args, '--format')).toBe('jsonl');
    expect(Number(flagValue(args, '--rate-limit'))).toBeLessThanOrEqual(5);
    expect(flagValue(args, '--max-concurrent-targets')).toBe('1');
    expect(args.slice(-2)).toEqual(['https://shop.example.org/search?q=a', 'https://shop.example.org/p?id=1&x=2']);
    for (const forbidden of [
      '-b', '--blind', '--blind-oob', '--blind-oob-secret', '--custom-blind-xss-payload', '--remote-payloads', '--remote-wordlists',
      '--custom-payload', '--only-custom-payload', '-F', '--follow-redirects', '--sxss', '--deep-scan', '--hpp', '--waf-evasion',
    ]) {
      expect(args).not.toContain(forbidden);
    }
    expect(() => buildDalfoxArgs({ urls: [], proxyUrl: proxy })).toThrow();
    expect(() => buildDalfoxArgs({ urls: ['https://shop.example.org/'], proxyUrl: proxy })).toThrow(/query parameters/);
    expect(() => buildDalfoxArgs({ urls: Array.from({ length: 26 }, (_, i) => `https://s.example.org/p?i=${i}`), proxyUrl: proxy })).toThrow(/Too many/);
  });

  it('every tool refuses a proxy that is not the local pinning proxy', () => {
    for (const bad of ['http://evil.test:8080', 'http://127.0.0.1', 'socks5://127.0.0.1:1080', 'http://127.0.0.1:80/x', 'http://localhost:8080']) {
      expect(() => buildKatanaArgs({ url: 'https://shop.example.org', proxyUrl: bad })).toThrow(/pinning proxy/);
      expect(() => buildFfufArgs({ origin: 'https://shop.example.org', wordlistPath: '/w.txt', proxyUrl: bad })).toThrow(/pinning proxy/);
      expect(() => buildDalfoxArgs({ urls: ['https://s.example.org/p?i=1'], proxyUrl: bad })).toThrow(/pinning proxy/);
    }
  });

  it('QUICK runs no external binary; STANDARD adds katana; DEEP adds the rest; nothing is intrusive', () => {
    const ids = (profile: 'QUICK' | 'STANDARD' | 'DEEP') =>
      toolsForProfile(profile, { deepEnabled: true }).map((t) => t.id).sort();
    expect(ids('QUICK')).toEqual([]);
    expect(ids('STANDARD')).toEqual(['httpx', 'katana', 'nuclei']);
    expect(ids('DEEP')).toEqual(['dalfox', 'dnsx', 'ffuf', 'httpx', 'katana', 'naabu', 'nuclei', 'subfinder']);
    for (const entry of Object.values(TOOL_CATALOG)) expect(entry.riskLevel).not.toBe('INTRUSIVE');
  });
});
