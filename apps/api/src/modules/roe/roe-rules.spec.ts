import { describe, expect, it } from '@jest/globals';
import {
  assetCoversHost,
  findCoveringAsset,
  normalizeAsset,
  normalizeAssets,
  registrableDomain,
  targetHost,
  validateClientEmail,
  validateWindow,
  RoeRuleError,
} from './roe-rules.js';

const codeOf = (fn: () => unknown): string | null => {
  try {
    fn();
    return null;
  } catch (error) {
    return error instanceof RoeRuleError ? error.code : 'OTHER';
  }
};

describe('registrableDomain', () => {
  it('knows the apex of ordinary and two-label-suffix hosts', () => {
    expect(registrableDomain('shop.eu.example.org')).toBe('example.org');
    expect(registrableDomain('example.org')).toBe('example.org');
    expect(registrableDomain('www.example.co.uk')).toBe('example.co.uk');
    expect(registrableDomain('mail.acme.com.uz')).toBe('acme.com.uz');
  });
});

describe('normalizeAsset', () => {
  it('accepts a domain, a subdomain and a URL, normalised', () => {
    expect(normalizeAsset({ type: 'DOMAIN', value: ' Example.ORG. ' })).toEqual({ type: 'DOMAIN', value: 'example.org', host: 'example.org', wildcard: false });
    expect(normalizeAsset({ type: 'SUBDOMAIN', value: 'shop.example.org', wildcard: true })).toMatchObject({ host: 'shop.example.org', wildcard: true });
    expect(normalizeAsset({ type: 'URL', value: 'https://Shop.Example.org:8443/app?x=1' })).toEqual({
      type: 'URL',
      value: 'https://shop.example.org:8443',
      host: 'shop.example.org',
      wildcard: false,
    });
  });

  it('reads "*.example.org" as the wildcard form of example.org', () => {
    expect(normalizeAsset({ type: 'DOMAIN', value: '*.example.org' })).toMatchObject({ host: 'example.org', wildcard: true });
  });

  it('wildcard is off by default and meaningless for a URL', () => {
    expect(normalizeAsset({ type: 'DOMAIN', value: 'example.org' }).wildcard).toBe(false);
    expect(normalizeAsset({ type: 'URL', value: 'https://example.org', wildcard: true }).wildcard).toBe(false);
  });

  it.each([
    ['IPv4 as a domain', { type: 'DOMAIN', value: '93.184.216.34' }],
    ['IPv4 as a subdomain', { type: 'SUBDOMAIN', value: '10.0.0.5' }],
    ['CIDR', { type: 'DOMAIN', value: '192.168.0.0/24' }],
    ['IPv6', { type: 'DOMAIN', value: '2001:db8::1' }],
    ['IP in a URL', { type: 'URL', value: 'http://93.184.216.34/admin' }],
    ['IPv6 in a URL', { type: 'URL', value: 'http://[2001:db8::1]/' }],
    ['the IP asset type', { type: 'IP_ADDRESS', value: 'example.org' }],
    ['the CIDR asset type', { type: 'CIDR', value: '10.0.0.0/8' }],
  ] as const)('rejects %s with the IP message', (_label, input) => {
    expect(codeOf(() => normalizeAsset(input as never))).toBe('ROE_IP_NOT_SUPPORTED');
  });

  it('the IP rejection says what to do instead', () => {
    try {
      normalizeAsset({ type: 'DOMAIN', value: '10.0.0.5' });
    } catch (error) {
      expect((error as Error).message).toMatch(/domain, subdomain or URL/);
    }
  });

  it.each([
    ['empty', { type: 'DOMAIN', value: '' }],
    ['spaces', { type: 'DOMAIN', value: 'a b.example.org' }],
    ['a scheme on a domain', { type: 'DOMAIN', value: 'https://example.org' }],
    ['a path on a domain', { type: 'DOMAIN', value: 'example.org/admin' }],
    ['a port on a domain', { type: 'DOMAIN', value: 'example.org:8080' }],
    ['credentials on a domain', { type: 'DOMAIN', value: 'user@example.org' }],
    ['a flag-like value', { type: 'DOMAIN', value: '-oX.example.org' }],
    ['localhost', { type: 'DOMAIN', value: 'localhost' }],
    ['a public suffix', { type: 'DOMAIN', value: 'co.uk' }],
    ['a bare TLD', { type: 'DOMAIN', value: 'com' }],
    ['a non-http URL', { type: 'URL', value: 'ftp://example.org' }],
    ['a URL with credentials', { type: 'URL', value: 'https://u:p@example.org' }],
    ['a URL without a scheme', { type: 'URL', value: 'example.org/x' }],
    ['an unknown type', { type: 'EMAIL', value: 'example.org' }],
  ] as const)('rejects %s', (_label, input) => {
    expect(codeOf(() => normalizeAsset(input as never))).toBe('ROE_INVALID_REQUEST');
  });
});

describe('normalizeAssets', () => {
  it('needs at least one asset, caps the count and removes duplicates', () => {
    expect(codeOf(() => normalizeAssets([]))).toBe('ROE_INVALID_REQUEST');
    const many = Array.from({ length: 21 }, (_, i) => ({ type: 'DOMAIN' as const, value: `site${i}.example.org` }));
    expect(codeOf(() => normalizeAssets(many))).toBe('ROE_INVALID_REQUEST');
    expect(
      normalizeAssets([
        { type: 'DOMAIN', value: 'example.org' },
        { type: 'DOMAIN', value: 'EXAMPLE.org' },
      ]),
    ).toHaveLength(1);
  });

  it('one bad asset fails the whole request (an IP among domains)', () => {
    expect(
      codeOf(() =>
        normalizeAssets([
          { type: 'DOMAIN', value: 'example.org' },
          { type: 'DOMAIN', value: '10.1.1.1' },
        ]),
      ),
    ).toBe('ROE_IP_NOT_SUPPORTED');
  });
});

describe('validateClientEmail — the approving mailbox must be the client\'s own', () => {
  const org = normalizeAssets([{ type: 'DOMAIN', value: 'example.org' }]);
  const requester = 'tester@pentest-firm.io';

  it('accepts an address at the apex or at a subdomain of it, and lower-cases it', () => {
    expect(validateClientEmail('CISO@Example.org', org, requester)).toEqual({ email: 'ciso@example.org', domain: 'example.org' });
    expect(validateClientEmail('it@security.example.org', org, requester).domain).toBe('security.example.org');
  });

  it('accepts an address at the apex when the asset is a subdomain or URL under it', () => {
    const assets = normalizeAssets([
      { type: 'SUBDOMAIN', value: 'shop.eu.example.org' },
      { type: 'URL', value: 'https://app.example.org/login' },
    ]);
    expect(validateClientEmail('ciso@example.org', assets, requester).domain).toBe('example.org');
  });

  it('rejects an address at an unrelated domain', () => {
    expect(codeOf(() => validateClientEmail('ciso@other.com', org, requester))).toBe('ROE_EMAIL_DOMAIN_MISMATCH');
  });

  it('rejects a lookalike domain and a parent-less suffix trick', () => {
    expect(codeOf(() => validateClientEmail('ciso@evilexample.org', org, requester))).toBe('ROE_EMAIL_DOMAIN_MISMATCH');
    expect(codeOf(() => validateClientEmail('ciso@example.org.evil.com', org, requester))).toBe('ROE_EMAIL_DOMAIN_MISMATCH');
    expect(codeOf(() => validateClientEmail('ciso@org', org, requester))).toBe('ROE_INVALID_REQUEST');
  });

  it('every asset must match: a second asset under another domain makes the address wrong', () => {
    const two = normalizeAssets([
      { type: 'DOMAIN', value: 'example.org' },
      { type: 'DOMAIN', value: 'other-client.com' },
    ]);
    expect(codeOf(() => validateClientEmail('ciso@example.org', two, requester))).toBe('ROE_EMAIL_DOMAIN_MISMATCH');
  });

  it('refuses the requester\'s own account mailbox, even when it matches the domain', () => {
    expect(codeOf(() => validateClientEmail('Me@Example.org', org, 'me@example.org'))).toBe('ROE_EMAIL_BLOCKED');
  });

  it('refuses free-mail providers even if the "asset" is the provider', () => {
    const gmail = normalizeAssets([{ type: 'DOMAIN', value: 'gmail.com' }]);
    expect(codeOf(() => validateClientEmail('someone@gmail.com', gmail, requester))).toBe('ROE_EMAIL_BLOCKED');
    expect(codeOf(() => validateClientEmail('someone@mail.ru', org, requester))).toBe('ROE_EMAIL_BLOCKED');
  });

  it('refuses disposable domains even if the "asset" is that domain', () => {
    const tmp = normalizeAssets([{ type: 'DOMAIN', value: 'mailinator.com' }]);
    expect(codeOf(() => validateClientEmail('x@mailinator.com', tmp, requester))).toBe('ROE_EMAIL_BLOCKED');
    expect(codeOf(() => validateClientEmail('x@yopmail.com', org, requester))).toBe('ROE_EMAIL_BLOCKED');
  });

  it('refuses a public-suffix domain and malformed addresses', () => {
    expect(codeOf(() => validateClientEmail('x@co.uk', org, requester))).toBe('ROE_EMAIL_BLOCKED');
    for (const bad of ['', 'no-at-sign', 'a@b', 'a b@example.org', 'a@example.org, b@example.org', '<a@example.org>', 'a@@example.org', `${'x'.repeat(70)}@example.org`]) {
      expect(codeOf(() => validateClientEmail(bad, org, requester))).toBe('ROE_INVALID_REQUEST');
    }
  });

  it('handles two-label suffixes: example.co.uk is the apex of www.example.co.uk', () => {
    const uk = normalizeAssets([{ type: 'SUBDOMAIN', value: 'www.example.co.uk' }]);
    expect(validateClientEmail('ciso@example.co.uk', uk, requester).domain).toBe('example.co.uk');
    expect(codeOf(() => validateClientEmail('ciso@other.co.uk', uk, requester))).toBe('ROE_EMAIL_DOMAIN_MISMATCH');
  });
});

describe('validateWindow', () => {
  const now = new Date('2026-10-23T10:00:00Z');
  const iso = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString();

  it('accepts a window up to 90 days', () => {
    expect(validateWindow(iso(0), iso(90), now).end.getTime() - validateWindow(iso(0), iso(90), now).start.getTime()).toBe(90 * 86_400_000);
    expect(validateWindow(iso(1), iso(8), now)).toBeTruthy();
  });

  it.each([
    ['91 days', () => validateWindow(iso(0), iso(91), now)],
    ['end before start', () => validateWindow(iso(5), iso(2), now)],
    ['already over', () => validateWindow(iso(-10), iso(-5), now)],
    ['start far in the past', () => validateWindow(iso(-3), iso(10), now)],
    ['start too far ahead', () => validateWindow(iso(90), iso(95), now)],
    ['garbage', () => validateWindow('nope', 'nope', now)],
  ])('rejects %s', (_label, run) => {
    expect(codeOf(run)).toBe('ROE_INVALID_REQUEST');
  });
});

describe('coverage: apex and wildcard rules', () => {
  const apex = { type: 'DOMAIN', host: 'example.org', wildcard: false };
  const wild = { type: 'DOMAIN', host: 'example.org', wildcard: true };
  const sub = { type: 'SUBDOMAIN', host: 'shop.example.org', wildcard: false };
  const url = { type: 'URL', host: 'app.example.org', wildcard: false };

  it('without the wildcard flag only the host itself is covered', () => {
    expect(assetCoversHost(apex, 'example.org')).toBe(true);
    expect(assetCoversHost(apex, 'EXAMPLE.org.')).toBe(true);
    expect(assetCoversHost(apex, 'www.example.org')).toBe(false);
    expect(assetCoversHost(apex, 'a.b.example.org')).toBe(false);
  });

  it('with the wildcard flag subdomains at any depth are covered, lookalikes never', () => {
    expect(assetCoversHost(wild, 'www.example.org')).toBe(true);
    expect(assetCoversHost(wild, 'a.b.example.org')).toBe(true);
    expect(assetCoversHost(wild, 'evilexample.org')).toBe(false);
    expect(assetCoversHost(wild, 'example.org.evil.com')).toBe(false);
    expect(assetCoversHost(wild, 'example.com')).toBe(false);
  });

  it('a subdomain asset does not cover its parent; a URL asset covers its own host only', () => {
    expect(assetCoversHost(sub, 'example.org')).toBe(false);
    expect(assetCoversHost(sub, 'shop.example.org')).toBe(true);
    expect(assetCoversHost({ ...url, wildcard: true }, 'x.app.example.org')).toBe(false);
    expect(assetCoversHost(url, 'app.example.org')).toBe(true);
  });

  it('targetHost: hostnames and URLs yes, IPs and unknown types no', () => {
    expect(targetHost('DOMAIN', 'Example.org')).toBe('example.org');
    expect(targetHost('SUBDOMAIN', 'shop.example.org.')).toBe('shop.example.org');
    expect(targetHost('URL', 'https://app.example.org:8443/x')).toBe('app.example.org');
    expect(targetHost('URL', 'http://93.184.216.34/')).toBeNull();
    expect(targetHost('IP_ADDRESS', '93.184.216.34')).toBeNull();
    expect(targetHost('CIDR', '10.0.0.0/8')).toBeNull();
    expect(targetHost('DOMAIN', '10.0.0.5')).toBeNull();
  });

  it('findCoveringAsset picks the asset that covers the target, and none for an IP target', () => {
    const assets = [apex, url];
    expect(findCoveringAsset(assets, 'DOMAIN', 'example.org')).toBe(apex);
    expect(findCoveringAsset(assets, 'URL', 'https://app.example.org/login')).toBe(url);
    expect(findCoveringAsset(assets, 'DOMAIN', 'www.example.org')).toBeNull();
    expect(findCoveringAsset([wild], 'IP_ADDRESS', '93.184.216.34')).toBeNull();
  });
});
