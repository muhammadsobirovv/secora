import { describe, expect, it } from '@jest/globals';
import { WhoisNormalizer } from './whois.normalizer.js';

describe('WhoisNormalizer', () => {
  const ctx = { tool: 'WHOIS' as const, targetValue: 'example.com' };

  it('parses a generic gTLD whois record into one WHOIS_RECORD finding', () => {
    const raw = [
      'Domain Name: EXAMPLE.COM',
      'Registrar: RESERVED-Internet Assigned Numbers Authority',
      'Updated Date: 2023-08-14T07:01:44Z',
      'Creation Date: 1995-08-14T04:00:00Z',
      'Registry Expiry Date: 2024-08-13T04:00:00Z',
      'Domain Status: clientDeleteProhibited https://icann.org/epp#clientDeleteProhibited',
      'Domain Status: clientTransferProhibited https://icann.org/epp#clientTransferProhibited',
      'Name Server: A.IANA-SERVERS.NET',
      'Name Server: B.IANA-SERVERS.NET',
      '>>> Last update of whois database: 2024-01-01T00:00:00Z <<<',
    ].join('\n');

    const findings = new WhoisNormalizer().normalize(raw, ctx);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      type: 'WHOIS_RECORD',
      value: 'example.com',
      dedupKey: 'example.com',
      data: {
        domain: 'example.com',
        registrar: 'RESERVED-Internet Assigned Numbers Authority',
        creationDate: '1995-08-14T04:00:00Z',
        expiryDate: '2024-08-13T04:00:00Z',
        updatedDate: '2023-08-14T07:01:44Z',
        nameServers: ['a.iana-servers.net', 'b.iana-servers.net'],
        statuses: ['clientDeleteProhibited', 'clientTransferProhibited'],
      },
    });
  });

  it('returns no finding for "no match" style output', () => {
    const raw = 'No match for domain "NONEXISTENT-DOMAIN-XYZ.COM".';
    expect(new WhoisNormalizer().normalize(raw, ctx)).toEqual([]);
  });

  it('ignores comment lines (starting with % or #)', () => {
    const raw = [
      '% This is a comment',
      '# Also a comment',
      'Registrar: Example Registrar',
    ].join('\n');
    const findings = new WhoisNormalizer().normalize(raw, ctx);
    expect(findings[0]?.data).toMatchObject({ registrar: 'Example Registrar' });
  });
});
