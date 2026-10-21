/// Removes secrets from a tool's argv before it is written to the audit log.
///
/// Three layers, because a secret can arrive in any of them:
///  1. the VALUE of a flag that always carries one (--password, -auth, ...);
///  2. the value of a sensitive HTTP header given with -H (Authorization,
///     Cookie, X-Api-Key, ...), keeping the header name so the log still says
///     which header was sent;
///  3. secret-looking text anywhere in an argument: Bearer tokens, JWTs,
///     provider key formats, credentials inside a URL, and token-like query
///     parameters.
/// The result is a new array; the argv that is actually executed is untouched.

const REDACTED = '[REDACTED]';

const SECRET_VALUE_FLAGS = new Set([
  '-auth',
  '--auth',
  '-password',
  '--password',
  '-pass',
  '--pass',
  '-token',
  '--token',
  '-api-key',
  '--api-key',
  '-apikey',
  '--apikey',
  '-cookie',
  '--cookie',
  '-secret',
  '--secret',
  '-proxy-auth',
  '--proxy-auth',
]);

const HEADER_FLAGS = new Set(['-H', '-header', '--header']);

const SENSITIVE_HEADER_NAME =
  /^\s*(authorization|proxy-authorization|cookie|set-cookie|x-api-key|x-auth-token|x-access-token|x-csrf-token|x-amz-security-token|x-.*(?:token|secret|key|password))\s*:/i;

const REPLACEMENTS: [RegExp, string][] = [
  // https://user:password@host -> https://[REDACTED]@host
  [/(:\/\/)[^/\s:@]+:[^/\s@]*@/g, `$1${REDACTED}@`],
  // ?token=abc&key=def -> ?token=[REDACTED]&key=[REDACTED]
  [
    /([?&](?:access_?token|id_?token|refresh_?token|token|api_?key|key|secret|password|passwd|pwd|auth|signature|sig)=)[^&\s]+/gi,
    `$1${REDACTED}`,
  ],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, `Bearer ${REDACTED}`],
  [/\bBasic\s+[A-Za-z0-9+/=]{8,}/g, `Basic ${REDACTED}`],
  // JWT
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, REDACTED],
  // GitHub, AWS, Slack, Stripe style keys
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, REDACTED],
  [/\bAKIA[0-9A-Z]{16}\b/g, REDACTED],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, REDACTED],
  [/\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g, REDACTED],
];

function scrub(text: string): string {
  let out = text;
  for (const [pattern, replacement] of REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

export function redactArgv(argv: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const previous = i > 0 ? argv[i - 1] : undefined;

    // --password=value / -token=value
    const eq = arg.indexOf('=');
    if (arg.startsWith('-') && eq > 0 && SECRET_VALUE_FLAGS.has(arg.slice(0, eq))) {
      out.push(`${arg.slice(0, eq)}=${REDACTED}`);
      continue;
    }
    if (previous !== undefined && SECRET_VALUE_FLAGS.has(previous)) {
      out.push(REDACTED);
      continue;
    }
    if (previous !== undefined && HEADER_FLAGS.has(previous)) {
      const name = arg.split(':', 1)[0];
      out.push(SENSITIVE_HEADER_NAME.test(arg) ? `${name}: ${REDACTED}` : scrub(arg));
      continue;
    }
    out.push(scrub(arg));
  }
  return out;
}
