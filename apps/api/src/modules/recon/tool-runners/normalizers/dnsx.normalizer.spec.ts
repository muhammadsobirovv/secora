import { describe, expect, it } from '@jest/globals';
import { DnsxNormalizer } from './dnsx.normalizer.js';

describe('DnsxNormalizer', () => {
  it('parses per-host JSON with multiple record-type arrays into individual DNS_RECORD findings', () => {
    const raw = JSON.stringify({
      host: 'example.com',
      a: ['93.184.216.34'],
      ns: ['a.iana-servers.net.', 'b.iana-servers.net.'],
    });

    const findings = new DnsxNormalizer().normalize(raw);

    expect(findings).toHaveLength(3);
    expect(findings).toContainEqual(
      expect.objectContaining({ type: 'DNS_RECORD', value: 'A 93.184.216.34' }),
    );
    expect(findings).toContainEqual(
      expect.objectContaining({
        type: 'DNS_RECORD',
        value: 'NS a.iana-servers.net.',
      }),
    );
  });

  it('returns no findings for a host with no requested record types present', () => {
    const raw = JSON.stringify({ host: 'example.com' });
    const findings = new DnsxNormalizer().normalize(raw);
    expect(findings).toHaveLength(0);
  });
});
