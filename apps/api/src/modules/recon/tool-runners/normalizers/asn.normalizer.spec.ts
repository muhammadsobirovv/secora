import { describe, expect, it } from '@jest/globals';
import { AsnNormalizer } from './asn.normalizer.js';

describe('AsnNormalizer', () => {
  it('parses a Cymru verbose whois response into one ASN finding', () => {
    const raw = [
      'AS      | IP               | BGP Prefix          | CC | Registry | Allocated  | AS Name',
      '15169   | 8.8.8.8          | 8.8.8.0/24          | US | arin     | 1992-12-01 | GOOGLE, US',
    ].join('\n');

    const findings = new AsnNormalizer().normalize(raw);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      type: 'ASN',
      value: 'AS15169',
      dedupKey: '8.8.8.8:15169',
      data: {
        asn: '15169',
        ip: '8.8.8.8',
        bgpPrefix: '8.8.8.0/24',
        countryCode: 'US',
        registry: 'arin',
        asName: 'GOOGLE, US',
      },
    });
  });

  it('skips the header row', () => {
    const raw = 'AS      | IP               | BGP Prefix\n';
    expect(new AsnNormalizer().normalize(raw)).toEqual([]);
  });

  it('returns an empty array when nothing matches the pipe-separated shape', () => {
    expect(new AsnNormalizer().normalize('Error: no route to host')).toEqual(
      [],
    );
  });
});
