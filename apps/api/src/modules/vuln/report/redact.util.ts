/// Text hygiene for everything that leaves the scanner: evidence shown in a
/// report or a share link, and anything sent to an AI provider.
///
/// Two separate jobs:
///  - redactSecrets removes credentials a scan may have captured (cookies,
///    tokens, keys, passwords in URLs or bodies);
///  - sanitizeUntrusted makes text from a scanned site safe to place inside a
///    prompt: control characters out, length capped, and our own delimiter
///    words neutralised so a page cannot close the data block early.

const REDACTED = '<redacted>';

const SECRET_KEYS =
  'pass(?:word|wd)?|pwd|secret|token|api[_-]?key|apikey|access[_-]?key|private[_-]?key|auth(?:orization)?|session(?:id)?|sid|csrf|xsrf|jwt|credential|signature|bearer';

const RULES: {
  pattern: RegExp;
  replace: string | ((substring: string, ...groups: string[]) => string);
}[] = [
  // PEM private keys, whole block.
  {
    pattern:
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
    replace: '<redacted private key>',
  },
  // Header lines that carry credentials: keep the name, hide the value.
  {
    pattern: /^(\s*(?:proxy-)?authorization\s*:\s*).*$/gim,
    replace: (_m, head) => `${head}${REDACTED}`,
  },
  {
    pattern: /^(\s*(?:set-cookie|cookie)\s*:\s*)(.*)$/gim,
    replace: (_m, head, rest) => `${head}${hideCookieValues(rest)}`,
  },
  {
    pattern:
      /^(\s*x-(?:api-key|auth-token|csrf-token|xsrf-token|amz-security-token)\s*:\s*).*$/gim,
    replace: (_m, head) => `${head}${REDACTED}`,
  },
  // Credentials inside a URL: scheme://user:pass@host
  {
    pattern: /\b([a-z][a-z0-9+.-]*:\/\/)([^\s/@:]+):([^\s/@]+)@/gi,
    replace: (_m, scheme, user) => `${scheme}${user}:${REDACTED}@`,
  },
  // Well-known token shapes.
  {
    pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/g,
    replace: `Bearer ${REDACTED}`,
  },
  {
    pattern: /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g,
    replace: '<redacted jwt>',
  },
  { pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, replace: '<redacted aws key>' },
  {
    pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
    replace: '<redacted github token>',
  },
  {
    pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
    replace: '<redacted slack token>',
  },
  {
    pattern: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
    replace: '<redacted stripe key>',
  },
  { pattern: /\bAIza[0-9A-Za-z_-]{30,}\b/g, replace: '<redacted google key>' },
  // key=value / "key": "value" pairs with a secret-looking key.
  {
    pattern: new RegExp(
      `(["']?\\b[\\w.-]*(?:${SECRET_KEYS})[\\w.-]*["']?\\s*[:=]\\s*)(["']?)([^\\s"'&;,<>)]{3,})(["']?)`,
      'gi',
    ),
    replace: (_m, head, open, _value, close) =>
      `${head}${open}${REDACTED}${close}`,
  },
  // Long hex strings (hashes, keys).
  { pattern: /\b[a-f0-9]{40,}\b/gi, replace: '<redacted hex>' },
];

function hideCookieValues(rest: string): string {
  // "a=1; Path=/; HttpOnly, b=2" -> keep attribute names, hide values of name=value pairs
  return rest
    .split(';')
    .map((part, index) => {
      const trimmed = part.trim();
      const eq = trimmed.indexOf('=');
      if (eq <= 0) return trimmed;
      const name = trimmed.slice(0, eq);
      // Attributes after the first pair (Path, Domain, Expires, Max-Age, SameSite) are not secrets.
      if (
        index > 0 &&
        /^(path|domain|expires|max-age|samesite)$/i.test(name.trim())
      )
        return trimmed;
      return `${name}=${REDACTED}`;
    })
    .join('; ');
}

/// Removes credentials from free text. Safe to apply twice.
export function redactSecrets(text: string): string {
  let out = text;
  for (const rule of RULES) {
    out = out.replace(rule.pattern, rule.replace as never);
  }
  return out;
}

/// Evidence for a report: redacted, then cut to `maxChars` with a marker.
export function prepareEvidence(
  text: string | null | undefined,
  maxChars = 4000,
): string | null {
  if (!text) return null;
  const cleaned = stripControlChars(redactSecrets(text));
  return capText(cleaned, maxChars);
}

export function capText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n… [truncated, ${text.length - maxChars} more characters]`;
}

/// Control characters (except tab, newline) and ANSI escape sequences.
// C0/C1 controls (except tab and newline), line/paragraph separators, bidi overrides and the BOM.
// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE = new RegExp(
  String.fromCharCode(27) + '\\[[0-9;?]*[ -/]*[@-~]',
  'g',
);
const CR_LF = new RegExp(
  String.fromCharCode(13) + String.fromCharCode(10) + '?',
  'g',
);
const CONTROL_CHARS = new RegExp(
  '[' +
    '\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f-\\x9f' +
    [
      0x2028, 0x2029, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067,
      0x2068, 0x2069, 0xfeff,
    ]
      .map((code) => String.fromCharCode(code))
      .join('') +
    ']',
  'g',
);

export function stripControlChars(text: string): string {
  return text
    .replace(ANSI_ESCAPE, '')
    .replace(CR_LF, String.fromCharCode(10))
    .replace(CONTROL_CHARS, '');
}

/// Text from a scanned site, made safe to put in a prompt's data block.
export function sanitizeUntrusted(
  text: string | null | undefined,
  maxChars: number,
): string {
  if (!text) return '';
  const redacted = redactSecrets(text);
  const cleaned = stripControlChars(redacted)
    // Our delimiter vocabulary can never appear inside the data.
    .replace(/SCAN_DATA/gi, 'SCAN-DATA')
    .replace(/<{3,}|>{3,}/g, '‹‹‹')
    // Collapse runs of blank space so a page cannot push the real text out of the window.
    .replace(/[ \t]{3,}/g, '  ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return cleaned.length > maxChars ? `${cleaned.slice(0, maxChars)}…` : cleaned;
}
