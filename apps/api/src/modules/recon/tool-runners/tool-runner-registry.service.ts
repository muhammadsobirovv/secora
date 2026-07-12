import { Injectable } from '@nestjs/common';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { isToolCompatibleWithTargetType } from './tool-target-compatibility.js';
import type { ToolRunner, ToolRunTarget } from './tool-runner.interface.js';
import type { Normalizer } from './normalizers/normalizer.interface.js';
import type { ReconTool } from '../../../prisma-types.js';
import { NmapToolRunner } from './adapters/nmap.tool-runner.js';
import { SubfinderToolRunner } from './adapters/subfinder.tool-runner.js';
import { HttpxToolRunner } from './adapters/httpx.tool-runner.js';
import { DnsxToolRunner } from './adapters/dnsx.tool-runner.js';
import { NaabuToolRunner } from './adapters/naabu.tool-runner.js';
import { WhatWebToolRunner } from './adapters/whatweb.tool-runner.js';
import { AssetfinderToolRunner } from './adapters/assetfinder.tool-runner.js';
import { GowitnessToolRunner } from './adapters/gowitness.tool-runner.js';
import { AmassToolRunner } from './adapters/amass.tool-runner.js';
import { KatanaToolRunner } from './adapters/katana.tool-runner.js';
import { GauToolRunner } from './adapters/gau.tool-runner.js';
import { WaybackurlsToolRunner } from './adapters/waybackurls.tool-runner.js';
import { WhoisToolRunner } from './adapters/whois.tool-runner.js';
import { AsnToolRunner } from './adapters/asn.tool-runner.js';
import { NmapNormalizer } from './normalizers/nmap.normalizer.js';
import { SubfinderNormalizer } from './normalizers/subfinder.normalizer.js';
import { HttpxNormalizer } from './normalizers/httpx.normalizer.js';
import { DnsxNormalizer } from './normalizers/dnsx.normalizer.js';
import { NaabuNormalizer } from './normalizers/naabu.normalizer.js';
import { WhatWebNormalizer } from './normalizers/whatweb.normalizer.js';
import { AssetfinderNormalizer } from './normalizers/assetfinder.normalizer.js';
import { GowitnessNormalizer } from './normalizers/gowitness.normalizer.js';
import { AmassNormalizer } from './normalizers/amass.normalizer.js';
import { KatanaNormalizer } from './normalizers/katana.normalizer.js';
import { GauNormalizer } from './normalizers/gau.normalizer.js';
import { WaybackurlsNormalizer } from './normalizers/waybackurls.normalizer.js';
import { WhoisNormalizer } from './normalizers/whois.normalizer.js';
import { AsnNormalizer } from './normalizers/asn.normalizer.js';

/// Resolves a ReconTool to its ToolRunner + Normalizer pair and validates
/// the target/tool pairing before dispatch — the two are always used
/// together (the execution service never needs one without the other),
/// so one registry keyed by ReconTool covers both. Adding a future tool
/// means adding one runner class, one normalizer class, and one entry
/// here — nothing else in the module changes (Amass/Katana/Gau/
/// Waybackurls/WHOIS/ASN are the proof: all six were added this way).
@Injectable()
export class ToolRunnerRegistry {
  private readonly runners: Map<ReconTool, ToolRunner>;
  private readonly normalizers: Map<ReconTool, Normalizer>;

  constructor(
    nmap: NmapToolRunner,
    subfinder: SubfinderToolRunner,
    httpx: HttpxToolRunner,
    dnsx: DnsxToolRunner,
    naabu: NaabuToolRunner,
    whatweb: WhatWebToolRunner,
    assetfinder: AssetfinderToolRunner,
    gowitness: GowitnessToolRunner,
    amass: AmassToolRunner,
    katana: KatanaToolRunner,
    gau: GauToolRunner,
    waybackurls: WaybackurlsToolRunner,
    whois: WhoisToolRunner,
    asn: AsnToolRunner,
    nmapNormalizer: NmapNormalizer,
    subfinderNormalizer: SubfinderNormalizer,
    httpxNormalizer: HttpxNormalizer,
    dnsxNormalizer: DnsxNormalizer,
    naabuNormalizer: NaabuNormalizer,
    whatwebNormalizer: WhatWebNormalizer,
    assetfinderNormalizer: AssetfinderNormalizer,
    gowitnessNormalizer: GowitnessNormalizer,
    amassNormalizer: AmassNormalizer,
    katanaNormalizer: KatanaNormalizer,
    gauNormalizer: GauNormalizer,
    waybackurlsNormalizer: WaybackurlsNormalizer,
    whoisNormalizer: WhoisNormalizer,
    asnNormalizer: AsnNormalizer,
  ) {
    this.runners = new Map<ReconTool, ToolRunner>([
      [nmap.tool, nmap],
      [subfinder.tool, subfinder],
      [httpx.tool, httpx],
      [dnsx.tool, dnsx],
      [naabu.tool, naabu],
      [whatweb.to