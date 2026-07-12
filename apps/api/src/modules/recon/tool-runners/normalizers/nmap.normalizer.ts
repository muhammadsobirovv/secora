import { Injectable } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';
import { openPortDedupKey, serviceDedupKey } from '../dedup/dedup-key.util.js';
import type { Normalizer, ReconFindingInput } from './normalizer.interface.js';

interface NmapPort {
  '@_protocol'?: string;
  '@_portid'?: string;
  state?: { '@_state'?: string };
  service?: { '@_name'?: string; '@_product'?: string; '@_version'?: string };
}

interface NmapHost {
  address?:
    | { '@_addr'?: string; '@_addrtype'?: string }
    | Array<{ '@_addr'?: string; '@_addrtype'?: string }>;
  ports?: { port?: NmapPort | NmapPort[] };
}

interface NmapRun {
  nmaprun?: { host?: NmapHost | NmapHost[] };
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => name === 'host' || name === 'port' || name === 'address',
});

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function primaryAddress(host: NmapHost): string | null {
  const addresses = asArray(host.address);
  const ipv4 = addresses.find((a) => a['@_addrtype'] === 'ipv4');
  return (ipv4 ?? addresses[0])?.['@_addr'] ?? null;
}

/// nmap -oX - has no JSON equivalent — parses the XML tree via
/// fast-xml-parser. -Pn --top-ports 100 (the flags NmapToolRunner uses)
/// produces one <host> per scanned address, each with a <ports> list of
/// open/closed/filtered <port> entries.
@Injectable()
export class NmapNormalizer implements Normalizer {
  normalize(rawOutput: string): ReconFindingInput[] {
    const findings: ReconFindingInput[] = [];
    let parsed: NmapRun;
    try {
      parsed = parser.parse(rawOutput) as NmapRun;
    } catch {
      return findings;
    }

    for (const host of asArray(parsed.nmaprun?.host)) {
      const ip = primaryAddress(host);
      if (!ip) continue;

      for (const port of asArray(host.ports?.port)) {
        if (port.state?.['@_state'] !== 'open') continue;
        const portId = Number(port['@_portid']);
        const protocol = port['@_protocol'] ?? 'tcp';
        if (!Number.isFinite(portId)) continue;

        findings.push({
          type: 'OPEN_PORT',
          value: `${ip}:${portId}`,
          data: { ip, port: portId, protocol },
          dedupKey: openPortDedupKey(ip, portId, protocol),
        });

        const serviceName = port.service?.['@_name'];
        if (serviceName) {
          findings.push({
            type: 'SERVICE',
            value: `${serviceName} on ${ip}:${portId}`,
            data: {
              ip,
              port: portId,
              protocol,
              service: serviceName,
              product: port.service?.['@_product'] ?? null,
              version: port.service?.['@_version'] ?? null,
            },
            dedupKey: serviceDedupKey(ip, portId, protocol),
          });
        }
      }
    }
    return findings;
  }
}
