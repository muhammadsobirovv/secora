/// One pure function per ReconFindingType, computing the key half of the
/// (targetId, type, dedupKey) unique constraint that IS the Deduplication
/// pipeline stage (see ReconFinding schema comment). Kept as small, pure,
/// independently-testable functions — the dedup rule for a type is a
/// one-line change here, never scattered through a normalizer.

export function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, '');
}

export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const isDefaultPort =
      (parsed.protocol === 'http:' && parsed.port === '80') ||
      (parsed.protocol === 'https:' && parsed.port === '443');
    const host = isDefaultPort ? parsed.hostname : parsed.host;
    const path = parsed.pathname.replace(/\/$/, '') || '/';
    return `${parsed.protocol}//${host.toLowerCase()}${path}`;
  } catch {
    return url.trim().toLowerCase().replace(/\/$/, '');
  }
}

export function subdomainDedupKey(hostname: string): string {
  return normalizeHostname(hostname);
}

export function urlDedupKey(url: string): string {
  return normalizeUrl(url);
}

export function openPortDedupKey(
  ip: string,
  port: number,
  protocol: string,
): string {
  return `${ip}:${port}/${protocol.toLowerCase()}`;
}

export function serviceDedupKey(
  ip: string,
  port: number,
  protocol: string,
): string {
  return `${openPortDedupKey(ip, port, protocol)}:service`;
}

export function technologyDedupKey(host: string, techName: string): string {
  return `${normalizeHostname(host)}:${techName.trim().toLowerCase()}`;
}

export function dnsRecordDedupKey(
  hostname: string,
  recordType: string,
  recordValue: string,
): string {
  return `${normalizeHostname(hostname)}:${recordType.toUpperCase()}:${recordValue.trim().toLowerCase()}`;
}

/// Deliberately excludes the header VALUE — a value change (e.g. a Server
/// version bump) should update the existing finding's data/lastSeenAt,
/// not create a second row for the "same" header on the same host.
export function httpHeaderDedupKey(host: string, headerName: string): string {
  return `${normalizeHostname(host)}:${headerName.trim().toLowerCase()}`;
}

export function securityHeaderDedupKey(
  host: string,
  headerName: string,
): string {
  return `${normalizeHostname(host)}:secheader:${headerName.trim().toLowerCase()}`;
}

export function certificateDedupKey(
  host: string,
  port: number,
  fingerprintOrIssuerNotAfter: string,
): string {
  return `${normalizeHostname(host)}:${port}:cert:${fingerprintOrIssuerNotAfter}`;
}

export function screenshotDedupKey(url: string): string {
  return normalizeUrl(url);
}

export function whoisRecordDedupKey(domain: string): string {
  return normalizeHostname(domain);
}

export function asnDedupKey(ip: string, asn: string): string {
  return `${ip.trim()}:${asn.trim()}`;
}
