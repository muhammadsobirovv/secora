/// Module 14 — Security: IP Allow Lists. A small, dependency-free
/// matcher — exact IPv4/IPv6 addresses, plus IPv4 CIDR blocks
/// (`10.0.0.0/8`). IPv6 CIDR is deliberately not implemented (exact-
/// match only for IPv6 entries) — the overwhelmingly common self-hosted
/// deployment topology this feature targets (a reverse proxy in front
/// of a known office/VPN egress range) is IPv4, and a wrong hand-rolled
/// IPv6 CIDR matcher is worse than an honest "not supported yet" for a
/// security control. Use a real firewall/security-group rule for IPv6
/// range restriction in the meantime — this is defense in depth, not
/// the only layer.
function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    value = (value << 8) + octet;
  }
  return value >>> 0;
}

function matchesCidr(ip: string, cidr: string): boolean {
  const [range, prefixStr] = cidr.split('/');
  const prefix = Number(prefixStr);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  const ipInt = ipv4ToInt(ip);
  const rangeInt = ipv4ToInt(range);
  if (ipInt === null || rangeInt === null) return false;
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (rangeInt & mask);
}

export function parseAllowlist(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function isIpAllowlisted(clientIp: string, entries: string[]): boolean {
  if (entries.length === 0) {
    // Empty allowlist = feature disabled, not "deny everyone" — see
    // IP_ALLOWLIST's doc comment in env.validation.ts.
    return true;
  }
  // Strip a leading `::ffff:` IPv4-mapped-IPv6 prefix, common when
  // Express/Node reports an IPv4 client's address on a dual-stack socket.
  const normalizedIp = clientIp.startsWith('::ffff:') ? clientIp.slice(7) : clientIp;
  return entries.some((entry) => (entry.includes('/') ? matchesCidr(normalizedIp, entry) : entry === normalizedIp));
}
