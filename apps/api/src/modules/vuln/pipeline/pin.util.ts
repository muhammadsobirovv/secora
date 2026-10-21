import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import {
  isPrivateIpv4,
  isPrivateIpv6,
} from '../../../common/utils/ssrf-guard.util.js';
import { assertSafeHost } from './safe-input.js';

/// DNS pinning for tool runs.
///
/// httpx and nuclei have no "map host to IP" option, and both resolve names
/// themselves. So the host is resolved ONCE here, every answer must be public,
/// and the tools are then pointed at the chosen IP with the original name sent
/// in the Host header and TLS SNI. A name that re-resolves to an internal
/// address later (DNS rebinding) can no longer influence where the tool
/// connects. Verified against the pinned binaries: nuclei sends
/// "Host: <name>" while connecting to the IP.

export interface PinnedHost {
  /// The verified hostname (what the user owns).
  host: string;
  /// The single address the tools connect to.
  ip: string;
  family: 4 | 6;
}

export type AddressLookup = (
  host: string,
) => Promise<{ address: string; family: number }[]>;

export type PinFailureReason = 'NO_ADDRESS' | 'PRIVATE_ADDRESS';

export class PinBlockedError extends Error {
  constructor(
    readonly reason: PinFailureReason,
    message: string,
  ) {
    super(message);
    this.name = 'PinBlockedError';
  }
}

function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version === 6) return isPrivateIpv6(address);
  return true; // not an IP: fail closed
}

const defaultLookup: AddressLookup = (host) =>
  lookup(host, { all: true, verbatim: true });

export async function resolvePinnedHost(
  host: string,
  options: { allowPrivateTargets?: boolean; lookupAddresses?: AddressLookup } = {},
): Promise<PinnedHost> {
  const safeHost = assertSafeHost(host);
  const addresses = await (options.lookupAddresses ?? defaultLookup)(safeHost);
  if (addresses.length === 0) {
    throw new PinBlockedError('NO_ADDRESS', `${safeHost} does not resolve.`);
  }
  // Every answer must be public, not just the one chosen: a mixed answer is
  // exactly what a rebinding attempt looks like.
  if (!options.allowPrivateTargets && addresses.some((a) => isPrivateAddress(a.address))) {
    throw new PinBlockedError(
      'PRIVATE_ADDRESS',
      `${safeHost} resolves to a private, internal or reserved address.`,
    );
  }
  const chosen = addresses.find((a) => isIP(a.address) === 4) ?? addresses[0];
  return {
    host: safeHost,
    ip: chosen.address,
    family: isIP(chosen.address) === 6 ? 6 : 4,
  };
}

const bracket = (pin: PinnedHost): string => (pin.family === 6 ? `[${pin.ip}]` : pin.ip);

/// "http(s)://<ip>[:port]/path" for a URL on the pinned host.
export function pinUrl(url: string, pin: PinnedHost): string {
  const parsed = new URL(url);
  if (parsed.hostname !== pin.host) {
    throw new Error(`Refusing to pin ${parsed.hostname}: pinned host is ${pin.host}.`);
  }
  const port = parsed.port ? `:${parsed.port}` : '';
  const path = parsed.pathname === '/' && !url.endsWith('/') ? '' : parsed.pathname;
  return `${parsed.protocol}//${bracket(pin)}${port}${path}${parsed.search}`;
}

/// Inverse of pinUrl, for URLs a tool printed: shows the real hostname again.
export function unpinUrl(url: string, pin: PinnedHost): string {
  return url.split(`//${bracket(pin)}`).join(`//${pin.host}`);
}

/// Both schemes for a bare host, because the tools probe a name over http and
/// https but a pinned IP has to be given a scheme explicitly.
export function pinnedSchemeUrls(pin: PinnedHost): string[] {
  return [`http://${bracket(pin)}`, `https://${bracket(pin)}`];
}

/// Extra argv that makes a pinned request look like it was made to the name.
export function pinnedHostArgs(pin: PinnedHost): string[] {
  return ['-H', `Host: ${pin.host}`, '-sni', pin.host];
}
