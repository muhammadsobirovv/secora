import { describe, expect, it } from '@jest/globals';
import { NmapNormalizer } from './nmap.normalizer.js';

const SINGLE_HOST_XML = `<?xml version="1.0"?>
<nmaprun>
<host starttime="1" endtime="1">
<status state="up" reason="reset" reason_ttl="33"/>
<address addr="93.184.216.34" addrtype="ipv4"/>
<ports>
<port protocol="tcp" portid="80">
<state state="open" reason="syn-ack" reason_ttl="33"/>
<service name="http" product="nginx" version="1.18.0" method="table" conf="3"/>
</port>
<port protocol="tcp" portid="443">
<state state="closed" reason="reset" reason_ttl="33"/>
</port>
</ports>
</host>
</nmaprun>`;

describe('NmapNormalizer', () => {
  it('parses XML into OPEN_PORT findings for open ports only, plus a SERVICE finding when a service name is present', () => {
    const findings = new NmapNormalizer().normalize(SINGLE_HOST_XML);

    const openPorts = findings.filter((f) => f.type === 'OPEN_PORT');
    const services = findings.filter((f) => f.type === 'SERVICE');

    // Port 443 is closed — must not appear at all.
    expect(openPorts).toHaveLength(1);
    expect(openPorts[0]).toMatchObject({
      value: '93.184.216.34:80',
      dedupKey: '93.184.216.34:80/tcp',
    });
    expect(services).toHaveLength(1);
    expect(services[0]?.data).toMatchObject({
      product: 'nginx',
      version: '1.18.0',
    });
  });

  it('returns no findings for malformed XML instead of throwing', () => {
    const findings = new NmapNormalizer().normalize('not xml at all &<>');
    expect(Array.isArray(findings)).toBe(