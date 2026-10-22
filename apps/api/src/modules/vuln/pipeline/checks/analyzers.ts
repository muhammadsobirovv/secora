import type { VulnFindingSeverity } from '../../../../prisma-types.js';
import type { FindingDraft } from '../stage-findings.js';
import type { PinnedResponse, TlsInfo } from './pinned-io.js';

/// Pure judgement of what the native checks observed. Nothing here touches the
/// network, so every rule is covered by a unit test. Each draft carries a
/// plain-language fix.

const DAY_MS = 24 * 60 * 60 * 1000;

interface Where {
  /// "https://shop.example.org" — where the response came from.
  origin: string;
}

const HEADERS_DOC = 'https://developer.mozilla.org/docs/Web/HTTP/Headers';
const OWASP_HEADERS = 'https://owasp.org/www-project-secure-headers/';

function draft(
  where: Where,
  id: string,
  severity: VulnFindingSeverity,
  title: string,
  description: string,
  remediation: string,
  extra: Partial<FindingDraft> = {},
): FindingDraft {
  return {
    title,
    description,
    severity,
    vulnType: id,
    signature: `secora-check:${id}@${where.origin}`,
    path: '/',
    matchedAt: where.origin,
    remediation,
    confidence: 'CONFIRMED',
    owaspCategory: 'A05_SECURITY_MISCONFIGURATION',
    tags: ['secora-check'],
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// TLS
// ---------------------------------------------------------------------------

export function analyzeTls(
  info: TlsInfo,
  where: Where,
  now: Date = new Date(),
): FindingDraft[] {
  const out: FindingDraft[] = [];
  const tlsRef = {
    owaspCategory: 'A02_CRYPTOGRAPHIC_FAILURES' as const,
    tags: ['secora-check', 'tls'],
  };

  const validTo = info.validTo ? new Date(info.validTo) : null;
  if (validTo && !Number.isNaN(validTo.getTime())) {
    const daysLeft = Math.floor((validTo.getTime() - now.getTime()) / DAY_MS);
    if (daysLeft < 0) {
      out.push(
        draft(
          where,
          'tls-cert-expired',
          'HIGH',
          'TLS certificate has expired',
          `The certificate for ${where.origin} expired on ${info.validTo}. Browsers show a full-page warning and many clients refuse to connect.`,
          "Renew the certificate now and automate renewal (for example with ACME/Let's Encrypt) so it cannot lapse again.",
          {
            ...tlsRef,
            cwe: 'CWE-298',
            data: { validTo: info.validTo, daysLeft },
          },
        ),
      );
    } else if (daysLeft <= 30) {
      out.push(
        draft(
          where,
          'tls-cert-expiring',
          daysLeft <= 7 ? 'MEDIUM' : 'LOW',
          `TLS certificate expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
          `The certificate for ${where.origin} is valid until ${info.validTo}.`,
          'Renew the certificate before it expires and automate renewal so this does not depend on someone remembering.',
          { ...tlsRef, data: { validTo: info.validTo, daysLeft } },
        ),
      );
    }
  }

  if (
    !info.authorized &&
    !info.selfSigned &&
    info.authorizationError !== 'CERT_HAS_EXPIRED'
  ) {
    out.push(
      draft(
        where,
        'tls-cert-untrusted',
        'MEDIUM',
        'TLS certificate chain is not trusted',
        `The certificate presented by ${where.origin} does not validate (${info.authorizationError ?? 'unknown error'}). The server may be missing an intermediate certificate, or the issuer is not publicly trusted.`,
        'Serve the full chain (leaf plus intermediates) and use a certificate from a publicly trusted authority.',
        { ...tlsRef, cwe: 'CWE-295', data: { error: info.authorizationError } },
      ),
    );
  }
  if (info.selfSigned) {
    out.push(
      draft(
        where,
        'tls-cert-self-signed',
        'MEDIUM',
        'TLS certificate is self-signed',
        `${where.origin} presents a self-signed certificate, so clients cannot tell it from an impostor's.`,
        "Replace it with a certificate from a publicly trusted authority (Let's Encrypt is free).",
        { ...tlsRef, cwe: 'CWE-295' },
      ),
    );
  }
  if (!info.hostnameMatches) {
    out.push(
      draft(
        where,
        'tls-cert-hostname-mismatch',
        'MEDIUM',
        'TLS certificate does not match the hostname',
        `The certificate presented by ${where.origin} (subject ${info.subject ?? 'unknown'}) does not list this hostname.`,
        'Issue a certificate whose names include this exact hostname (or a matching wildcard).',
        { ...tlsRef, cwe: 'CWE-297', data: { subject: info.subject } },
      ),
    );
  }
  if (info.keyBits !== null && info.keyBits < 2048) {
    out.push(
      draft(
        where,
        'tls-weak-key',
        'MEDIUM',
        `TLS certificate uses a weak ${info.keyBits}-bit RSA key`,
        `RSA keys shorter than 2048 bits can be broken with modest resources.`,
        'Generate a new key of at least 2048 bits (or use an ECDSA P-256 key) and re-issue the certificate.',
        { ...tlsRef, cwe: 'CWE-326', data: { keyBits: info.keyBits } },
      ),
    );
  }

  const legacy = [
    info.acceptsTls10 ? 'TLS 1.0' : null,
    info.acceptsTls11 ? 'TLS 1.1' : null,
  ].filter((v): v is string => v !== null);
  if (legacy.length > 0) {
    out.push(
      draft(
        where,
        'tls-legacy-protocols',
        'MEDIUM',
        `Server still accepts ${legacy.join(' and ')}`,
        `${where.origin} completes handshakes using ${legacy.join(' and ')}, protocols with known weaknesses that were deprecated in 2021 (RFC 8996).`,
        'Disable TLS 1.0 and 1.1 and allow TLS 1.2 and 1.3 only.',
        {
          ...tlsRef,
          cwe: 'CWE-327',
          data: {
            acceptsTls10: info.acceptsTls10,
            acceptsTls11: info.acceptsTls11,
          },
        },
      ),
    );
  }
  if (
    info.protocol === 'TLSv1' ||
    info.protocol === 'TLSv1.1' ||
    info.protocol === 'SSLv3'
  ) {
    out.push(
      draft(
        where,
        'tls-negotiated-legacy',
        'MEDIUM',
        `Connection negotiated ${info.protocol}`,
        `A normal client handshake with ${where.origin} ended on ${info.protocol}.`,
        'Disable protocols older than TLS 1.2.',
        { ...tlsRef, cwe: 'CWE-327' },
      ),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// Response headers
// ---------------------------------------------------------------------------

const SIX_MONTHS_SECONDS = 15_552_000;

function directives(csp: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const part of csp.split(';')) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name) map.set(name.toLowerCase(), values);
  }
  return map;
}

export function analyzeHeaders(
  response: PinnedResponse,
  where: Where,
): FindingDraft[] {
  const out: FindingDraft[] = [];
  const h = response.headers;
  const https = where.origin.startsWith('https://');
  const evidence = { response: formatHeaders(response) };
  const withEvidence = (
    extra: Partial<FindingDraft> = {},
  ): Partial<FindingDraft> => ({
    references: [OWASP_HEADERS],
    evidence,
    ...extra,
  });

  if (https) {
    const hsts = h['strict-transport-security'];
    if (!hsts) {
      out.push(
        draft(
          where,
          'header-hsts-missing',
          'LOW',
          'Strict-Transport-Security header is missing',
          `${where.origin} does not tell browsers to use HTTPS only, so a first visit over plain HTTP can be intercepted and downgraded.`,
          'Send Strict-Transport-Security: max-age=31536000; includeSubDomains on every HTTPS response (add "preload" once you are sure every subdomain supports HTTPS).',
          withEvidence({
            cwe: 'CWE-319',
            references: [`${HEADERS_DOC}/Strict-Transport-Security`],
          }),
        ),
      );
    } else {
      const maxAge = Number(/max-age\s*=\s*"?(\d+)/i.exec(hsts)?.[1] ?? 0);
      if (maxAge < SIX_MONTHS_SECONDS) {
        out.push(
          draft(
            where,
            'header-hsts-weak',
            'INFO',
            'Strict-Transport-Security lifetime is short',
            `max-age is ${maxAge} seconds (${hsts}). Browsers forget the policy quickly.`,
            'Use max-age=31536000 (one year) or more.',
            withEvidence({
              references: [`${HEADERS_DOC}/Strict-Transport-Security`],
            }),
          ),
        );
      }
    }
  }

  const csp = h['content-security-policy'];
  if (!csp) {
    out.push(
      draft(
        where,
        'header-csp-missing',
        'LOW',
        'Content-Security-Policy header is missing',
        `${where.origin} sets no Content-Security-Policy, so the browser applies no second line of defence against injected scripts.`,
        "Start with a policy such as: default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'. Test with Content-Security-Policy-Report-Only first.",
        withEvidence({
          cwe: 'CWE-693',
          references: [`${HEADERS_DOC}/Content-Security-Policy`],
        }),
      ),
    );
  } else {
    const parsed = directives(csp);
    const scriptSources =
      parsed.get('script-src') ?? parsed.get('default-src') ?? [];
    const problems: string[] = [];
    if (
      scriptSources.includes("'unsafe-inline'") &&
      !scriptSources.some(
        (v) => v.startsWith("'nonce-") || v.startsWith("'sha"),
      )
    ) {
      problems.push("'unsafe-inline' scripts are allowed");
    }
    if (scriptSources.includes("'unsafe-eval'"))
      problems.push("'unsafe-eval' is allowed");
    const wildcard = scriptSources.some(
      (v) => v === '*' || v === 'http:' || v === 'https:' || v === 'data:',
    );
    if (wildcard) problems.push('scripts may load from any origin');
    if (problems.length > 0) {
      out.push(
        draft(
          where,
          'header-csp-weak',
          wildcard ? 'MEDIUM' : 'LOW',
          'Content-Security-Policy is weak',
          `The policy on ${where.origin} undermines its own protection: ${problems.join('; ')}.`,
          "Remove 'unsafe-inline' and 'unsafe-eval' from script-src (use nonces or hashes) and list the exact origins scripts may load from.",
          withEvidence({
            cwe: 'CWE-693',
            references: [`${HEADERS_DOC}/Content-Security-Policy`],
            data: { problems },
          }),
        ),
      );
    }
  }

  const frameAncestors = csp ? directives(csp).has('frame-ancestors') : false;
  if (!h['x-frame-options'] && !frameAncestors) {
    out.push(
      draft(
        where,
        'header-clickjacking',
        'LOW',
        'Page can be embedded in another site (clickjacking)',
        `${where.origin} sends neither X-Frame-Options nor a CSP frame-ancestors directive, so another site can load it in a frame and trick users into clicking.`,
        "Send Content-Security-Policy: frame-ancestors 'self' (or X-Frame-Options: SAMEORIGIN for old browsers).",
        withEvidence({
          cwe: 'CWE-1021',
          references: [`${HEADERS_DOC}/X-Frame-Options`],
        }),
      ),
    );
  }

  if ((h['x-content-type-options'] ?? '').toLowerCase() !== 'nosniff') {
    out.push(
      draft(
        where,
        'header-nosniff-missing',
        'LOW',
        'X-Content-Type-Options header is missing',
        `${where.origin} does not send X-Content-Type-Options: nosniff, so browsers may guess a file's type and run content as script.`,
        'Send X-Content-Type-Options: nosniff on all responses.',
        withEvidence({
          cwe: 'CWE-693',
          references: [`${HEADERS_DOC}/X-Content-Type-Options`],
        }),
      ),
    );
  }
  if (!h['referrer-policy']) {
    out.push(
      draft(
        where,
        'header-referrer-policy-missing',
        'INFO',
        'Referrer-Policy header is missing',
        `${where.origin} does not control how much of a page's URL is sent to other sites in the Referer header.`,
        'Send Referrer-Policy: strict-origin-when-cross-origin (or stricter).',
        withEvidence({ references: [`${HEADERS_DOC}/Referrer-Policy`] }),
      ),
    );
  }
  if (!h['permissions-policy']) {
    out.push(
      draft(
        where,
        'header-permissions-policy-missing',
        'INFO',
        'Permissions-Policy header is missing',
        `${where.origin} does not restrict which browser features (camera, microphone, geolocation) pages and embedded frames may use.`,
        'Send Permissions-Policy listing only the features you use, e.g. camera=(), microphone=(), geolocation=().',
        withEvidence({ references: [`${HEADERS_DOC}/Permissions-Policy`] }),
      ),
    );
  }
  return out;
}

function formatHeaders(response: PinnedResponse): string {
  const lines = [`HTTP ${response.status}`];
  for (const [name, value] of Object.entries(response.headers))
    lines.push(`${name}: ${value}`);
  for (const cookie of response.setCookies) lines.push(`set-cookie: ${cookie}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Version disclosure
// ---------------------------------------------------------------------------

const VERSIONED = /[A-Za-z][\w.-]*\/\d+(\.\d+)*/;

export function analyzeDisclosure(
  response: PinnedResponse,
  where: Where,
): FindingDraft[] {
  const out: FindingDraft[] = [];
  const evidence = { response: formatHeaders(response) };
  const server = response.headers.server;
  if (server && VERSIONED.test(server)) {
    out.push(
      draft(
        where,
        'disclosure-server-version',
        'LOW',
        'Web server version is disclosed',
        `The Server header of ${where.origin} reveals "${server}". Attackers use exact versions to look up known vulnerabilities.`,
        'Configure the server to send only the product name or nothing (nginx: server_tokens off; Apache: ServerTokens Prod).',
        {
          cwe: 'CWE-200',
          evidence,
          data: { header: 'server', value: server },
          tags: ['secora-check', 'disclosure'],
        },
      ),
    );
  }
  for (const name of [
    'x-powered-by',
    'x-aspnet-version',
    'x-aspnetmvc-version',
  ]) {
    const value = response.headers[name];
    if (!value) continue;
    out.push(
      draft(
        where,
        `disclosure-${name}`,
        'LOW',
        `${name} header discloses the technology stack`,
        `${where.origin} sends "${name}: ${value}", which tells attackers which framework and version to target.`,
        `Remove the ${name} header (framework setting or reverse-proxy rule).`,
        {
          cwe: 'CWE-200',
          evidence,
          data: { header: name, value },
          tags: ['secora-check', 'disclosure'],
        },
      ),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// Cookies
// ---------------------------------------------------------------------------

const SESSION_LIKE = /sess|sid|auth|token|jwt|login|user|account|remember/i;

interface ParsedCookie {
  name: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: string | null;
}

export function parseSetCookie(header: string): ParsedCookie | null {
  const parts = header.split(';').map((part) => part.trim());
  const [nameValue, ...attributes] = parts;
  const name = nameValue?.split('=')[0]?.trim();
  if (!name) return null;
  const lower = attributes.map((attribute) => attribute.toLowerCase());
  return {
    name,
    secure: lower.includes('secure'),
    httpOnly: lower.includes('httponly'),
    sameSite:
      lower
        .find((attribute) => attribute.startsWith('samesite='))
        ?.slice('samesite='.length) ?? null,
  };
}

export function analyzeCookies(
  response: PinnedResponse,
  where: Where,
): FindingDraft[] {
  const out: FindingDraft[] = [];
  const https = where.origin.startsWith('https://');
  const evidenceBase = { response: formatHeaders(response) };
  for (const raw of response.setCookies) {
    const cookie = parseSetCookie(raw);
    if (!cookie) continue;
    const sensitive = SESSION_LIKE.test(cookie.name);
    const redacted = `${cookie.name}=<value hidden>`;
    const common = {
      path: '/',
      data: { cookie: cookie.name, sensitive },
      evidence: {
        response: evidenceBase.response.replace(
          /(set-cookie: [^=]+=)[^;\n]*/gi,
          '$1<value hidden>',
        ),
      },
      references: [
        'https://developer.mozilla.org/docs/Web/HTTP/Cookies#restrict_access_to_cookies',
      ],
      owaspCategory: 'A07_IDENTIFICATION_AUTH_FAILURES' as const,
      tags: ['secora-check', 'cookie'],
    };
    if (https && !cookie.secure) {
      out.push(
        draft(
          where,
          `cookie-no-secure:${cookie.name}`,
          sensitive ? 'MEDIUM' : 'LOW',
          `Cookie "${cookie.name}" is missing the Secure flag`,
          `${redacted} is set over HTTPS without Secure, so the browser will also send it over plain HTTP where it can be read.`,
          'Add the Secure attribute to the cookie.',
          { ...common, cwe: 'CWE-614' },
        ),
      );
    }
    if (!cookie.httpOnly) {
      out.push(
        draft(
          where,
          `cookie-no-httponly:${cookie.name}`,
          sensitive ? 'MEDIUM' : 'LOW',
          `Cookie "${cookie.name}" is missing the HttpOnly flag`,
          `${redacted} can be read by JavaScript on the page, so a cross-site scripting bug could steal it.`,
          'Add the HttpOnly attribute unless client-side code genuinely needs the cookie.',
          { ...common, cwe: 'CWE-1004' },
        ),
      );
    }
    if (!cookie.sameSite) {
      out.push(
        draft(
          where,
          `cookie-no-samesite:${cookie.name}`,
          'LOW',
          `Cookie "${cookie.name}" has no SameSite attribute`,
          `${redacted} sets no SameSite policy, which leaves the cookie to each browser's default and weakens protection against cross-site request forgery.`,
          'Add SameSite=Lax (or Strict) unless the cookie must be sent on cross-site requests.',
          { ...common, cwe: 'CWE-1275' },
        ),
      );
    } else if (cookie.sameSite === 'none' && !cookie.secure) {
      out.push(
        draft(
          where,
          `cookie-samesite-none-insecure:${cookie.name}`,
          'MEDIUM',
          `Cookie "${cookie.name}" uses SameSite=None without Secure`,
          `${redacted} is sent on cross-site requests but is not restricted to HTTPS; browsers reject such cookies.`,
          'Add Secure, or change SameSite to Lax.',
          { ...common, cwe: 'CWE-1275' },
        ),
      );
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

/// A fixed origin that cannot belong to anyone (".invalid" is reserved).
export const CORS_PROBE_ORIGIN = 'https://secora-cors-probe.invalid';

export function analyzeCors(
  response: PinnedResponse,
  where: Where,
  sentOrigin: string,
): FindingDraft[] {
  const allowOrigin = response.headers['access-control-allow-origin'];
  if (!allowOrigin) return [];
  const credentials =
    (
      response.headers['access-control-allow-credentials'] ?? ''
    ).toLowerCase() === 'true';
  const evidence = { response: formatHeaders(response) };
  const base = {
    path: '/',
    evidence,
    references: [
      'https://portswigger.net/web-security/cors',
      'https://developer.mozilla.org/docs/Web/HTTP/CORS',
    ],
    cwe: 'CWE-942',
    owaspCategory: 'A05_SECURITY_MISCONFIGURATION' as const,
    tags: ['secora-check', 'cors'],
    data: { allowOrigin, allowCredentials: credentials, sentOrigin },
  };
  const fix =
    'Answer CORS requests only for an explicit allow-list of trusted origins; never echo the Origin header back, and never combine credentials with a wildcard or "null".';

  if (allowOrigin === 'null') {
    return [
      draft(
        where,
        'cors-null-origin',
        credentials ? 'HIGH' : 'MEDIUM',
        'CORS allows the "null" origin',
        `${where.origin} sends Access-Control-Allow-Origin: null. Sandboxed iframes and local files have the "null" origin, so any attacker can obtain it.`,
        fix,
        base,
      ),
    ];
  }
  if (allowOrigin === sentOrigin && credentials) {
    return [
      draft(
        where,
        'cors-reflected-credentials',
        'HIGH',
        'CORS reflects any origin and allows credentials',
        `${where.origin} answered a request from the made-up origin ${sentOrigin} with Access-Control-Allow-Origin: ${allowOrigin} and Access-Control-Allow-Credentials: true. Any website can read authenticated responses on behalf of a logged-in visitor.`,
        fix,
        base,
      ),
    ];
  }
  if (allowOrigin === sentOrigin) {
    return [
      draft(
        where,
        'cors-reflected',
        'MEDIUM',
        'CORS reflects any origin',
        `${where.origin} echoes the Origin header (${sentOrigin}) into Access-Control-Allow-Origin, so any website can read its responses (without cookies).`,
        fix,
        base,
      ),
    ];
  }
  if (allowOrigin === '*' && credentials) {
    return [
      draft(
        where,
        'cors-wildcard-credentials',
        'MEDIUM',
        'CORS combines a wildcard with credentials',
        `${where.origin} sends Access-Control-Allow-Origin: * together with Allow-Credentials: true. Browsers refuse this combination, but it signals a misconfigured policy.`,
        fix,
        base,
      ),
    ];
  }
  if (allowOrigin === '*') {
    return [
      draft(
        where,
        'cors-wildcard',
        'INFO',
        'CORS allows every origin to read responses',
        `${where.origin} sends Access-Control-Allow-Origin: *. That is fine for public content and wrong for anything private.`,
        'Confirm the content is public; otherwise restrict the allowed origins.',
        base,
      ),
    ];
  }
  return [];
}

// ---------------------------------------------------------------------------
// HTTP -> HTTPS
// ---------------------------------------------------------------------------

export function analyzeHttpToHttps(
  httpResponse: PinnedResponse,
  where: Where,
  httpsOrigin: string,
): FindingDraft[] {
  const location = httpResponse.headers.location ?? '';
  const redirectsToHttps =
    httpResponse.status >= 300 &&
    httpResponse.status < 400 &&
    location.startsWith('https://');
  if (redirectsToHttps) return [];
  return [
    draft(
      where,
      'http-no-redirect-to-https',
      'LOW',
      'Plain HTTP is served instead of redirecting to HTTPS',
      `${where.origin} answers over HTTP (status ${httpResponse.status}) without redirecting to ${httpsOrigin}, so visitors who type the plain address stay on an unencrypted connection.`,
      'Redirect all HTTP requests to HTTPS with a 301 and send Strict-Transport-Security.',
      {
        cwe: 'CWE-319',
        owaspCategory: 'A02_CRYPTOGRAPHIC_FAILURES',
        evidence: { response: formatHeaders(httpResponse) },
        tags: ['secora-check', 'tls'],
      },
    ),
  ];
}
