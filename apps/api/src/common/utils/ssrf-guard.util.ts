import { HttpStatus } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { AppException } from '../exceptions/app.exception.js';

/// Module 15 — task #344 (dedicated security hardening review). Any place
/// this platform makes an outbound HTTP request to a URL a *user* supplied
/// (webhook delivery, webhook test-send) needs SSRF protection: without it,
/// a workspace MANAGER can point a webhook at `http://169.254.169.254/...`
/// (cloud metadata services), `http://127.0.0.1:<port>/...` (other
/// processes on the same host), or an internal-network address, and use
/// this API server as a pivot to reach things they otherwise couldn't.
///
/// Two call sites, deliberately both guarded rather than just one:
///  - Creation time (`CreateWebhookTokenHandler`) — rejects the obviously
///    unsafe case immediately with a clear error, best UX.
///  - Delivery time (`WebhookDeliveryQueueService.attemptDelivery`,
///    `TestWebhookTokenHandler`) — re-checked on every single outbound
///    call, not just once at creation. This is the layer that actually
///    matters: a hostname that resolved to a public IP at creation time
///    can be re-pointed at a private IP later (DNS rebinding), and a
///    naive "check once at creation" implementation would miss that
///    entirely.
///
/// This resolves the hostname and rejects if *any* resolved address is
/// loopback/private/link-local/multicast/reserved — not just the literal
/// string the user typed — which is what makes it effective against DNS
/// rebinding. Deliberately does NOT try to be a general-purpose "is this a
/// safe URL for anything" checker — it only covers what this codebase's
/// webhook delivery paths need (http/https egress).

const PRIVATE_IPV4_CIDRS: Array<{ base: number[]; bits: number }> = [
  { base: [0, 0, 0, 0], bits: 8 }, // "this" network
  { base: [10, 0, 0, 0], bits: 8 }, // RFC1918
  { base: [100, 64, 0, 0], bits: 10 }, // CGNAT
  { base: [127, 0, 0, 0], bits: 8 }, // loopback
  { base: [169, 254, 0, 0], bits: 16 }, // link-local, incl. cloud metadata (169.254.169.254)
  { base: [172, 16, 0, 0], bits: 12 }, // RFC1918
  { base: [192, 0, 0, 0], bits: 24 }, // IETF protocol assignments
  { base: [192, 0, 2, 0], bits: 24 }, // TEST-NET-1
  { base: [192, 168, 0, 0], bits: 16 }, // RFC1918
  { base: [198, 18, 0, 0], bits: 15 }, // benchmarking
  { base: [198, 51, 100, 0], bits: 24 }, // TEST-NET-2
  { base: [203, 0, 113, 0], bits: 24 }, // TEST-NET-3
  { base: [224, 0, 0, 0], bits: 4 }, // multicast
  { base: [240, 0, 0, 0], bits: 4 }, // reserved
  { base: [255, 255, 255, 255], bits: 32 }, // broadcast
];

function ipv4ToInt(octets: number[]): number {
  return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
}

export function isPrivateIpv4(address: string): boolean {
  const octets = address.split('.').map((part) => Number(part));
  if (octets.length !== 4 || octets.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true; // malformed — fail closed
  }
  const value = ipv4ToInt(octets);
  return PRIVATE_IPV4_CIDRS.some(({ base, bits }) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (value & mask) === (ipv4ToInt(base) & mask);
  });
}

export function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === '::1' || normalized === '::') return true; // loopback / unspecified
  if (normalized.startsWith('fe80:') || normalized.startsWith('fe8') || normalized.startsWith('fe9')) return true; // link-local
  if (normalized.startsWith('fec') || normalized.startsWith('fed') || normalized.startsWith('fee') || normalized.startsWith('fef')) return true; // deprecated site-local
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // unique local (fc00::/7)
  if (normalized.startsWith('ff')) return true; // multicast
  // IPv4-mapped IPv6 (::ffff:a.b.c.d) — unwrap and re-check as IPv4.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
  if (mapped) return isPrivateIpv4(mapped[1]);
  return false;
}

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal']);

export async function assertSafeWebhookUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new AppException('UNSAFE_WEBHOOK_URL', 'Webhook URL is not a valid URL.', HttpStatus.BAD_REQUEST);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new AppException('UNSAFE_WEBHOOK_URL', 'Webhook URL must use http or https.', HttpStatus.BAD_REQUEST);
  }

  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new AppException(
      'UNSAFE_WEBHOOK_URL',
      'Webhook URL points to a blocked internal hostname.',
      HttpStatus.BAD_REQUEST,
    );
  }

  let addresses: string[];
  try {
    const results = await lookup(hostname, { all: true, verbatim: true });
    addresses = results.map((r) => r.address);
  } catch {
    throw new AppException(
      'UNSAFE_WEBHOOK_URL',
      'Webhook URL hostname could not be resolved.',
      HttpStatus.BAD_REQUEST,
    );
  }

  if (addresses.length === 0) {
    throw new AppException(
      'UNSAFE_WEBHOOK_URL',
      'Webhook URL hostname did not resolve to any address.',
      HttpStatus.BAD_REQUEST,
    );
  }

  const unsafe = addresses.some((address) => (address.includes(':') ? isPrivateIpv6(address) : isPrivateIpv4(address)));
  if (unsafe) {
    throw new AppException(
      'UNSAFE_WEBHOOK_URL',
      'Webhook URL resolves to a private, loopback, or otherwise internal address and cannot be used.',
      HttpStatus.BAD_REQUEST,
    );
  }
}
