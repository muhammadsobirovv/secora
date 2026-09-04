/// Module 18 — task #506 (Structured logging + secret redaction).
///
/// `StructuredLoggerService` writes whatever gets passed to `.log()`/
/// `.error()`/etc. — including, potentially, a whole DTO or error-context
/// object a call site handed it without stripping sensitive fields first.
/// Rather than trust every one of hundreds of call sites across 18 modules
/// to remember never to log a password/token/secret, this is the single
/// choke point every log line passes through before it's serialized: any
/// object key matching the denylist below (case-insensitive, exact match
/// on the key name) has its value replaced with the literal string
/// `'[REDACTED]'`, recursively, at any depth, through arrays too.
///
/// Deliberately matches by key name, not by scanning values for
/// secret-shaped strings (entropy heuristics, regex for JWT-looking
/// strings, etc.) — a key-name denylist is the same approach this
/// project's http-exception.filter.ts and bootstrap.ts already take for
/// "never leak X" guarantees: predictable, auditable, no false sense of
/// security from a probabilistic detector that will eventually miss
/// something novel-shaped. The tradeoff is explicit: a secret stored under
/// an unlisted key name will NOT be redacted — this is a defense-in-depth
/// backstop for the common case (a DTO/env/header object logged whole),
/// not a substitute for call sites not logging secrets in the first place.
const SENSITIVE_KEYS = new Set([
  'password',
  'newpassword',
  'oldpassword',
  'currentpassword',
  'confirmpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'sessiontoken',
  'apikey',
  'api_key',
  'secret',
  'clientsecret',
  'client_secret',
  'privatekey',
  'private_key',
  'credentialencryptionkey',
  'encryptedapikey',
  'authorization',
  'cookie',
  'setcookie',
  'mfasecret',
  'mfacode',
  'backupcode',
  'backupcodes',
  'webhooksecret',
  'signingsecret',
  'ssn',
  'creditcard',
  'cardnumber',
  'cvv',
]);

const REDACTED = '[REDACTED]';
/// Guards against a pathological/circular object turning one log call into
/// an unbounded recursion — matches the depth a legitimate DTO/error
/// context object would ever need (a handful of levels of nesting), well
/// short of anything that would indicate a cycle or an attacker-controlled
/// structure being logged verbatim.
const MAX_DEPTH = 8;

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key.toLowerCase().replace(/[_-]/g, ''));
}

/// Redacts sensitive values by key name, recursively. Returns a new
/// structure — never mutates the input — so a caller that logs an object
/// it's still using elsewhere (e.g. before returning it from the same
/// function) can't have that object silently altered by a logging call.
export function redactSensitiveData(value: unknown, depth = 0): unknown {
  if (depth >= MAX_DEPTH) return '[MAX_DEPTH_EXCEEDED]';

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveData(item, depth + 1));
  }

  if (value instanceof Date || value instanceof RegExp) {
    return value;
  }

  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSensitiveKey(key) ? REDACTED : redactSensitiveData(val, depth + 1);
    }
    return out;
  }

  return value;
}
