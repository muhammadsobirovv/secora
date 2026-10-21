/// Input validation shared by the tool catalog and the DNS pinning helpers.
/// Kept dependency-free so both can import it without a cycle.

const HOST_PATTERN =
  /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/// Hostnames only. Rejects anything that could read as a flag ("-x"), a URL
/// with credentials, whitespace, or shell metacharacters. The argv array
/// already prevents shell injection; this stops argument injection.
export function assertSafeHost(host: string): string {
  const normalized = host.trim().toLowerCase().replace(/\.$/, '');
  if (!HOST_PATTERN.test(normalized)) {
    throw new Error(`Refusing to run a tool against "${host}": not a valid hostname.`);
  }
  return normalized;
}

/// URL form used for httpx and nuclei: http(s) only, no credentials.
export function assertSafeUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Refusing to run a tool against "${url}": not a URL.`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`Refusing to run a tool against "${url}": only http(s) is allowed.`);
  }
  if (parsed.username || parsed.password) {
    throw new Error('Refusing to run a tool against a URL that contains credentials.');
  }
  assertSafeHost(parsed.hostname);
  // Return the caller's own text (validated), not the normalized form, so the
  // argv is exactly what was verified.
  return url.trim();
}
