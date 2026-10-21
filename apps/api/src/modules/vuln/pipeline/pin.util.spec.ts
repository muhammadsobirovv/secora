import { describe, expect, it } from '@jest/globals';
import {
  PinBlockedError,
  pinnedHostArgs,
  pinnedSchemeUrls,
  pinUrl,
  resolvePinnedHost,
  unpinUrl,
  type PinnedHost,
} from './pin.util.js';
import { buildHttpxArgs, buildNucleiArgs } from './tool-catalog.js';

const lookupOf = (...addresses: string[]) => async () =>
  addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));

describe('resolvePinnedHost — DNS pinning and SSRF', () => {
  it('pins a public name to one address', async () => {
    const pin = await resolvePinnedHost('Shop.Example.org', {
      lookupAddresses: lookupOf('93.184.216.34'),
    });
    expect(pin).toEqual({ host: 'shop.example.org', ip: '93.184.216.34', family: 4 });
  });

  it('prefers IPv4 when both families are returned', async () => {
    const pin = await resolvePinnedHost('shop.example.org', {
      lookupAddresses: lookupOf('2606:2800:220:1:248:1893:25c8:1946', '93.184.216.34'),
    });
    expect(pin.ip).toBe('93.184.216.34');
  });

  it('rejects private, loopback, link-local and metadata addresses', async () => {
    for (const address of ['10.0.0.5', '192.168.1.10', '127.0.0.1', '169.254.169.254', '::1']) {
      await expect(
        resolvePinnedHost('intranet.example.org', { lookupAddresses: lookupOf(address) }),
      ).rejects.toMatchObject({ reason: 'PRIVATE_ADDRESS' });
    }
  });

  it('rejects a mixed answer (rebinding looks like one public + one internal address)', async () => {
    await expect(
      resolvePinnedHost('rebind.example.org', {
        lookupAddresses: lookupOf('93.184.216.34', '169.254.169.254'),
      }),
    ).rejects.toBeInstanceOf(PinBlockedError);
  });

  it('rejects a name that does not resolve and an unsafe name', async () => {
    await expect(
      resolvePinnedHost('gone.example.org', { lookupAddresses: lookupOf() }),
    ).rejects.toMatchObject({ reason: 'NO_ADDRESS' });
    await expect(resolvePinnedHost('-oX', { lookupAddresses: lookupOf('93.184.216.34') })).rejects.toThrow(
      /not a valid hostname/,
    );
  });

  it('allows private addresses only when a lab explicitly opts in', async () => {
    const pin = await resolvePinnedHost('shop.lab.test', {
      allowPrivateTargets: true,
      lookupAddresses: lookupOf('172.24.0.2'),
    });
    expect(pin.ip).toBe('172.24.0.2');
  });
});

describe('pinned URL helpers', () => {
  const pin: PinnedHost = { host: 'shop.example.org', ip: '93.184.216.34', family: 4 };
  const pin6: PinnedHost = { host: 'shop.example.org', ip: '2606:2800::1', family: 6 };

  it('swaps the host for the IP and back, keeping scheme, port and path', () => {
    expect(pinUrl('https://shop.example.org:8443/app?x=1', pin)).toBe('https://93.184.216.34:8443/app?x=1');
    expect(unpinUrl('https://93.184.216.34:8443/app', pin)).toBe('https://shop.example.org:8443/app');
  });

  it('brackets IPv6 literals', () => {
    expect(pinnedSchemeUrls(pin6)).toEqual(['http://[2606:2800::1]', 'https://[2606:2800::1]']);
  });

  it('refuses to pin a URL on a different host', () => {
    expect(() => pinUrl('https://evil.example.net/', pin)).toThrow(/Refusing to pin/);
  });

  it('sends the real name as Host header and TLS SNI', () => {
    expect(pinnedHostArgs(pin)).toEqual(['-H', 'Host: shop.example.org', '-sni', 'shop.example.org']);
  });
});

describe('catalog argv with a DNS pin', () => {
  const pin: PinnedHost = { host: 'shop.example.org', ip: '93.184.216.34', family: 4 };

  it('httpx connects to the IP and never contains the hostname as a target', () => {
    const args = buildHttpxArgs({ target: 'shop.example.org', pin });
    const targets = args.filter((_, i) => args[i - 1] === '-u');
    expect(targets).toEqual(['http://93.184.216.34', 'https://93.184.216.34']);
    expect(args).toContain('Host: shop.example.org');
    expect(args).not.toContain('-fr');
  });

  it('nuclei uses only the live URLs the probe found, pinned to the IP', () => {
    const args = buildNucleiArgs({
      target: { kind: 'DOMAIN', value: 'shop.example.org' },
      profile: 'QUICK',
      pin,
      urls: ['https://shop.example.org'],
    });
    expect(args.filter((_, i) => args[i - 1] === '-u')).toEqual(['https://93.184.216.34']);
    expect(args).toContain('Host: shop.example.org');
    expect(args).toContain('-ni');
  });

  it('nuclei refuses a probe URL that is not on the pinned host', () => {
    expect(() =>
      buildNucleiArgs({
        target: { kind: 'DOMAIN', value: 'shop.example.org' },
        profile: 'QUICK',
        pin,
        urls: ['https://evil.example.net'],
      }),
    ).toThrow(/Refusing to pin/);
  });
});
