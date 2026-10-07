import {
  evaluateActiveScanTarget,
  parseSuffixList,
  type ActiveScanGuardOptions,
} from './active-scan-network-guard.js';

function options(
  overrides: Partial<ActiveScanGuardOptions> = {},
): ActiveScanGuardOptions {
  return {
    allowPrivateTargets: false,
    denylist: parseSuffixList('gov.uz,mil.uz,gov,mil'),
    allowlist: [],
    resolveHost: () => Promise.resolve(['93.184.216.34']),
    ...overrides,
  };
}

describe('evaluateActiveScanTarget', () => {
  it.each([
    ['IP_ADDRESS', '10.0.0.5'],
    ['IP_ADDRESS', '192.168.1.1'],
    ['IP_ADDRESS', '127.0.0.1'],
    ['IP_ADDRESS', '169.254.169.254'],
    ['IP_ADDRESS', '::1'],
    ['URL', 'http://169.254.169.254/latest/meta-data'],
    ['URL', 'http://[fd00::1]:8080/'],
    ['CIDR', '10.0.0.0/24'],
    ['CIDR', '172.16.0.0/12'],
    ['CIDR', '0.0.0.0/0'],
  ])(
    'blocks private, loopback and metadata address %s %s',
    async (type, value) => {
      const result = await evaluateActiveScanTarget({ type, value }, options());
      expect(result.allowed).toBe(false);
    },
  );

  it.each([
    ['DOMAIN', 'localhost'],
    ['SUBDOMAIN', 'app.localhost'],
    ['URL', 'http://localhost:3000/admin'],
    ['DOMAIN', 'metadata.google.internal'],
  ])('blocks localhost and metadata hostnames %s %s', async (type, value) => {
    const result = await evaluateActiveScanTarget({ type, value }, options());
    expect(result.allowed).toBe(false);
  });

  it('blocks a public-looking hostname that resolves to a private address', async () => {
    const result = await evaluateActiveScanTarget(
      { type: 'DOMAIN', value: 'internal.example.com' },
      options({
        resolveHost: () => Promise.resolve(['93.184.216.34', '10.1.2.3']),
      }),
    );
    expect(result).toMatchObject({ allowed: false });
  });

  it('allows a public IP, CIDR and hostname', async () => {
    for (const target of [
      { type: 'IP_ADDRESS', value: '93.184.216.34' },
      { type: 'CIDR', value: '93.184.216.0/24' },
      { type: 'DOMAIN', value: 'example.com' },
      { type: 'URL', value: 'https://app.example.com/login' },
    ]) {
      expect(await evaluateActiveScanTarget(target, options())).toEqual({
        allowed: true,
      });
    }
  });

  it('refuses denylisted government and military domains unless allow-listed', async () => {
    const gov = await evaluateActiveScanTarget(
      { type: 'DOMAIN', value: 'portal.gov.uz' },
      options(),
    );
    expect(gov.allowed).toBe(false);
    const mil = await evaluateActiveScanTarget(
      { type: 'URL', value: 'https://www.army.mil/' },
      options(),
    );
    expect(mil.allowed).toBe(false);

    const allowed = await evaluateActiveScanTarget(
      { type: 'DOMAIN', value: 'portal.gov.uz' },
      options({ allowlist: parseSuffixList('portal.gov.uz') }),
    );
    expect(allowed).toEqual({ allowed: true });
  });

  it('does not treat a lookalike suffix as denylisted', async () => {
    const result = await evaluateActiveScanTarget(
      { type: 'DOMAIN', value: 'notgov.uz' },
      options(),
    );
    expect(result).toEqual({ allowed: true });
  });

  it('allows private targets when a self-hosted deployment opts in', async () => {
    const result = await evaluateActiveScanTarget(
      { type: 'IP_ADDRESS', value: '10.0.0.5' },
      options({ allowPrivateTargets: true }),
    );
    expect(result).toEqual({ allowed: true });
  });
});
