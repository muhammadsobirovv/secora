import { Injectable } from '@nestjs/common';
import { asnDedupKey } from '../dedup/dedup-key.util.js';
import type { Normalizer, ReconFindingInput } from './normalizer.interface.js';

/// `whois -h whois.cymru.com " -v <ip>"` (verbose mode) emits one header
/// row plus one pipe-separated data row:
/// AS      | IP               | BGP Prefix          | CC | Registry | Allocated  | AS Name
/// 15169   | 8.8.8.8          | 8.8.8.0/24          | US | arin     | 1992-12-01 | GOOGLE, US
@Injectable()
export class AsnNormalizer implements Normalizer {
  normalize(rawOutput: string): ReconFindingInput[] {
    const findings: ReconFindingInput[] = [];
    for (const line of rawOutput.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.includes('|')) continue;

      const columns = trimmed.split('|').map((c) => c.trim());
      const [
        asNumber,
        ip,
        bgpPrefix,
        countryCode,
        registry,
        allocated,
        asName,
      ] = columns;
      if (!asNumber || asNumber.toUpperCase() === 'AS' || !ip) continue; // header row

      findings.push({
        type: 'ASN',
        value: `AS${asNumber}`,
        data: {
          asn: asNumber,
          ip,
          bgpPrefix: bgpPrefix ?? null,
          countryCode: countryCode ?? null,
          registry: registry ?? null,
          allocated: allocated ?? null,
          asName: asName ?? null,
        },
        dedupKey: asnDedupKey(ip, as