import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import {
  PRIVATE_IPV4_CIDRS,
  ipv4ToInt,
  isPrivateIpv4,
  isPrivateIpv6,
} from '../../common/utils/ssrf-guard.util.js';

/// Network guard for ACTIVE scans from the hosted service. Reuses the SSRF
/// guard's private/reserved address classification (common/utils/
/// ssrf-guard.util.ts) so "what counts as internal" is defined in one
/// place. Refuses:
///  - private, loopback, link-local (incl. cloud metadata 169.254.169.254),
///    CGNAT, multicast and reserved addresses — as IP targets, inside CIDR
///    targets, or as any resolved address of a hostname (resolution happens
///    at scan start, so a name re-pointed at an internal address is caught);
///  - localhost / *.localhost and well-known metadata hostnames;
///  - hostnames under a configurable denylist of suffixes (default:
///    government and military), unless explicitly allow-listed.
/// Self-hosted deployments can allow private targets with
/// ACTIVE_SCAN_ALLOW_PRIVATE_TARGETS=true.

export interface ActiveScanGuardOptions {
  allowPrivateTargets: boolean;
  denylist: string[];
  allowlist: string[];
  /// Injectable for tests; defaults to the system resolver.
  resolveHost?: (hostname: string) => Promise<string[]>;
}

export type ActiveScanGuardResult =
  { allowed: true } | { allowed: false; reason: string };

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata',
]);

export function parseSuffixList(raw: string): string[] {
  return raw
    .split(',')
    .map((s) =>
      s
        .trim()
        .toLowerCase()
        .replace(/^\*?\./, ''),
    )
    .filter(Boolean);
}

function matchesSuffix(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith(`.${suffix}`);
}

async function defaultResolve(hostname: string): Promise<string[]> {
  try {
    const results = await lookup(hostname, { all: true, verbatim: true });
    return results.map((r) => r.address);
  } catch {
    // Unresolvable now: the scanners would fail to resolve it too.
    return [];
  }
}

function hostFromTarget(type: string, value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (type === 'URL') {
    try {
      const url = new URL(
        /^[a-z][a-z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`,
      );
      return url.hostname.replace(/^\[|\]$/g, '');
    } catch {
      return trimmed;
    }
  }
  return trimmed.replace(/\.$/, '');
}

function cidrOverlapsPrivate(cidr: string): boolean {
  const [base, bitsRaw] = cidr.split('/');
  const bits = Number(bitsRaw);
  if (!base || Number.isNaN(bits)) return true; // malformed: fail closed
  if (isIP(base) === 6) return isPrivateIpv6(base) || bits < 16;
  if (isIP(base) !== 4 || bits < 0 || bits > 32) return true;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  const start = (ipv4ToInt(base.split('.').map(Number)) & mask) >>> 0;
  const end = (start | (~mask >>> 0)) >>> 0;
  return PRIVATE_IPV4_CIDRS.some(({ base: b, bits: pb }) => {
    const pmask = pb === 0 ? 0 : (0xffffffff << (32 - pb)) >>> 0;
    const pstart = (ipv4ToInt(b) & pmask) >>> 0;
    const pend = (pstart | (~pmask >>> 0)) >>> 0;
    return start <= pend && pstart <= end;
  });
}

function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version === 6) return isPrivateIpv6(address);
  return true; // not an IP: fail closed
}

export async function evaluateActiveScanTarget(
  target: { type: string; value: string },
  options: ActiveScanGuardOptions,
): Promise<ActiveScanGuardResult> {
  const host = hostFromTarget(target.type, target.value);

  if (target.type === 'CIDR') {
    if (!options.allowPrivateTargets && cidrOverlapsPrivate(host)) {
      return {
        allowed: false,
        reason: 'The range includes private, internal or reserved addresses.',
      };
    }
    return { allowed: true };
  }

  if (isIP(host)) {
    if (!options.allowPrivateTargets && isPrivateAddress(host)) {
      return {
        allowed: false,
        reason:
          'Private, internal, loopback and cloud metadata addresses cannot be actively scanned.',
      };
    }
    return { allowed: true };
  }

  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith('.localhost')) {
    return {
      allowed: false,
      reason:
        'Localhost and cloud metadata hostnames cannot be actively scanned.',
    };
  }

  const allowlisted = options.allowlist.some((s) => matchesSuffix(host, s));
  const denied = options.denylist.find((s) => matchesSuffix(host, s));
  if (denied && !allowlisted) {
    return {
      allowed: false,
      reason: `Domains under ".${denied}" (government/military) are refused for active scans by default. If you own this asset and hold written authorization, contact support@secora.group.`,
    };
  }

  if (!options.allowPrivateTargets) {
    const addresses = await (options.resolveHost ?? defaultResolve)(host);
    if (addresses.some(isPrivateAddress)) {
      return {
        allowed: false,
        reason:
          'The hostname resolves to a private, internal or reserved address.',
      };
    }
  }

  return { allowed: true };
}
