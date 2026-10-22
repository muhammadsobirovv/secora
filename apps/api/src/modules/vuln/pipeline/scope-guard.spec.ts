import { describe, expect, it, jest } from '@jest/globals';
import { ScopeGuard, scopeRuleFor } from './scope-guard.js';
import type { AddressLookup } from './pin.util.js';

const PUBLIC = [{ address: '93.184.216.34', family: 4 }];

function lookupOf(
  table: Record<string, { address: string; family: number }[]>,
) {
  return jest.fn<AddressLookup>(async (host) => table[host] ?? []);
}

describe('scopeRuleFor — what each ownership method covers', () => {
  it('DNS TXT on a DOMAIN target covers the apex and its subdomains', () => {
    const rule = scopeRuleFor({
      host: 'example.org',
      targetType: 'DOMAIN',
      method: 'DNS_TXT',
    });
    expect(rule).toEqual({ root: 'example.org', includeSubdomains: true });
  });

  it.each(['HTTP_FILE', 'META_TAG'] as const)(
    '%s covers only the verified host',
    (method) => {
      const rule = scopeRuleFor({
        host: 'example.org',
        targetType: 'DOMAIN',
        method,
      });
      expect(rule.includeSubdomains).toBe(false);
    },
  );

  it('DNS TXT on a SUBDOMAIN or URL target stays exact-host', () => {
    expect(
      scopeRuleFor({
        host: 'shop.example.org',
        targetType: 'SUBDOMAIN',
        method: 'DNS_TXT',
      }).includeSubdomains,
    ).toBe(false);
    expect(
      scopeRuleFor({
        host: 'shop.example.org',
        targetType: 'URL',
        method: 'DNS_TXT',
      }).includeSubdomains,
    ).toBe(false);
  });

  it('an unknown method covers only the host', () => {
    expect(
      scopeRuleFor({ host: 'example.org', targetType: 'DOMAIN', method: null })
        .includeSubdomains,
    ).toBe(false);
  });
});

describe('ScopeGuard.admitHost', () => {
  const apexGuard = (lookup: ReturnType<typeof lookupOf>) =>
    new ScopeGuard(
      { root: 'example.org', includeSubdomains: true },
      { lookupAddresses: lookup },
    );

  it('admits a public subdomain of a DNS-verified apex and pins it', async () => {
    const guard = apexGuard(lookupOf({ 'api.example.org': PUBLIC }));
    const result = await guard.admitHost('API.example.org.');
    expect(result).toMatchObject({
      ok: true,
      pin: { host: 'api.example.org', ip: '93.184.216.34' },
    });
  });

  it('drops a host outside the verified scope without resolving it', async () => {
    const lookup = lookupOf({ 'other.com': PUBLIC });
    const result = await apexGuard(lookup).admitHost('other.com');
    expect(result).toMatchObject({ ok: false, reason: 'OUT_OF_SCOPE' });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('drops a lookalike of the apex', async () => {
    const result = await apexGuard(lookupOf({})).admitHost('evilexample.org');
    expect(result).toMatchObject({ ok: false, reason: 'OUT_OF_SCOPE' });
  });

  it('a host-only rule refuses subdomains', async () => {
    const guard = new ScopeGuard(
      { root: 'example.org', includeSubdomains: false },
      { lookupAddresses: lookupOf({ 'api.example.org': PUBLIC }) },
    );
    expect(await guard.admitHost('api.example.org')).toMatchObject({
      ok: false,
      reason: 'OUT_OF_SCOPE',
    });
  });

  it.each([
    ['loopback', '127.0.0.1'],
    ['private 10/8', '10.1.2.3'],
    ['private 192.168/16', '192.168.1.5'],
    ['link-local metadata', '169.254.169.254'],
    ['IPv6 loopback', '::1'],
  ])(
    'drops an in-scope name that resolves to a %s address',
    async (_label, address) => {
      const guard = apexGuard(
        lookupOf({
          'internal.example.org': [
            { address, family: address.includes(':') ? 6 : 4 },
          ],
        }),
      );
      expect(await guard.admitHost('internal.example.org')).toMatchObject({
        ok: false,
        reason: 'PRIVATE_ADDRESS',
      });
    },
  );

  it('refuses a mixed public + private answer (rebinding signature)', async () => {
    const guard = apexGuard(
      lookupOf({
        'mixed.example.org': [
          { address: '93.184.216.34', family: 4 },
          { address: '10.0.0.7', family: 4 },
        ],
      }),
    );
    expect(await guard.admitHost('mixed.example.org')).toMatchObject({
      ok: false,
      reason: 'PRIVATE_ADDRESS',
    });
  });

  it('DNS rebinding: the first answer is pinned, a later private answer is never consulted', async () => {
    const lookup = jest
      .fn<AddressLookup>()
      .mockResolvedValueOnce(PUBLIC)
      .mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    const guard = apexGuard(lookup as unknown as ReturnType<typeof lookupOf>);
    const first = await guard.admitHost('rebind.example.org');
    const second = await guard.admitHost('rebind.example.org');
    expect(first).toMatchObject({ ok: true, pin: { ip: '93.184.216.34' } });
    expect(second).toEqual(first);
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('a name that first answers privately stays refused even if it later turns public', async () => {
    const lookup = jest
      .fn<AddressLookup>()
      .mockResolvedValueOnce([{ address: '10.0.0.7', family: 4 }])
      .mockResolvedValue(PUBLIC);
    const guard = apexGuard(lookup as unknown as ReturnType<typeof lookupOf>);
    expect(await guard.admitHost('flip.example.org')).toMatchObject({
      ok: false,
    });
    expect(await guard.admitHost('flip.example.org')).toMatchObject({
      ok: false,
    });
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('drops a name that does not resolve', async () => {
    expect(
      await apexGuard(lookupOf({})).admitHost('ghost.example.org'),
    ).toMatchObject({
      ok: false,
      reason: 'NO_ADDRESS',
    });
  });

  it('refuses IP literals and malformed hosts', async () => {
    const guard = apexGuard(lookupOf({}));
    expect(await guard.admitHost('93.184.216.34')).toMatchObject({
      ok: false,
      reason: 'IP_LITERAL',
    });
    expect(await guard.admitHost('[::1]')).toMatchObject({
      ok: false,
      reason: 'IP_LITERAL',
    });
    expect(await guard.admitHost('-bad.example.org')).toMatchObject({
      ok: false,
      reason: 'INVALID_HOST',
    });
  });

  it('a lab may opt in to private targets', async () => {
    const guard = new ScopeGuard(
      { root: 'juice.lab.test', includeSubdomains: false },
      {
        allowPrivateTargets: true,
        lookupAddresses: lookupOf({
          'juice.lab.test': [{ address: '127.0.0.1', family: 4 }],
        }),
      },
    );
    expect(await guard.admitHost('juice.lab.test')).toMatchObject({ ok: true });
  });
});

describe('ScopeGuard.admitUrl — discovered URLs and redirects', () => {
  const guard = () =>
    new ScopeGuard(
      { root: 'shop.example.org', includeSubdomains: false },
      {
        lookupAddresses: lookupOf({
          'shop.example.org': PUBLIC,
          'evil.test': PUBLIC,
        }),
        extraPorts: [8443],
      },
    );

  it('admits a same-host URL and drops the fragment', async () => {
    const result = await guard().admitUrl(
      'https://shop.example.org/a?x=1#frag',
    );
    expect(result).toMatchObject({
      ok: true,
      url: 'https://shop.example.org/a?x=1',
      port: 443,
    });
  });

  it('resolves a relative redirect Location against the page URL', async () => {
    const result = await guard().admitUrl(
      '/login',
      'https://shop.example.org/home',
    );
    expect(result).toMatchObject({
      ok: true,
      url: 'https://shop.example.org/login',
    });
  });

  it('redirect to another host is dropped', async () => {
    const result = await guard().admitUrl(
      'https://evil.test/phish',
      'https://shop.example.org/',
    );
    expect(result).toMatchObject({ ok: false, reason: 'OUT_OF_SCOPE' });
  });

  it('a redirect to a subdomain is dropped when only the host is verified', async () => {
    const result = await guard().admitUrl(
      'https://api.shop.example.org/',
      'https://shop.example.org/',
    );
    expect(result).toMatchObject({ ok: false, reason: 'OUT_OF_SCOPE' });
  });

  it('refuses non-http schemes, credentials and odd ports', async () => {
    const g = guard();
    expect(await g.admitUrl('ftp://shop.example.org/x')).toMatchObject({
      ok: false,
      reason: 'BAD_SCHEME',
    });
    expect(await g.admitUrl('javascript:alert(1)')).toMatchObject({
      ok: false,
    });
    expect(await g.admitUrl('https://user:pw@shop.example.org/')).toMatchObject(
      { ok: false, reason: 'CREDENTIALS' },
    );
    expect(await g.admitUrl('https://shop.example.org:6379/')).toMatchObject({
      ok: false,
      reason: 'BAD_PORT',
    });
    expect(await g.admitUrl('https://shop.example.org:8443/')).toMatchObject({
      ok: true,
    });
  });

  it('refuses an IP-literal URL even when the address is public', async () => {
    expect(await guard().admitUrl('http://93.184.216.34/')).toMatchObject({
      ok: false,
      reason: 'IP_LITERAL',
    });
    expect(await guard().admitUrl('http://127.0.0.1/')).toMatchObject({
      ok: false,
      reason: 'IP_LITERAL',
    });
  });

  it('refuses garbage', async () => {
    expect(await guard().admitUrl('http://')).toMatchObject({
      ok: false,
      reason: 'BAD_URL',
    });
  });
});

describe('ScopeGuard.admitIp', () => {
  const guard = new ScopeGuard({
    root: 'example.org',
    includeSubdomains: true,
  });

  it('accepts public addresses and drops private or invalid ones', () => {
    expect(guard.admitIp('93.184.216.34')).toEqual({ ok: true });
    expect(guard.admitIp('10.0.0.1')).toMatchObject({
      ok: false,
      reason: 'PRIVATE_ADDRESS',
    });
    expect(guard.admitIp('127.0.0.1')).toMatchObject({
      ok: false,
      reason: 'PRIVATE_ADDRESS',
    });
    expect(guard.admitIp('fe80::1')).toMatchObject({
      ok: false,
      reason: 'PRIVATE_ADDRESS',
    });
    expect(guard.admitIp('not-an-ip')).toMatchObject({ ok: false });
  });
});
