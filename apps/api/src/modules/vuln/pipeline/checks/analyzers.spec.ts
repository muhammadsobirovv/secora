import { describe, expect, it } from '@jest/globals';
import {
  analyzeCookies,
  analyzeCors,
  analyzeDisclosure,
  analyzeHeaders,
  analyzeHttpToHttps,
  analyzeTls,
  CORS_PROBE_ORIGIN,
  parseSetCookie,
} from './analyzers.js';
import type { PinnedResponse, TlsInfo } from './pinned-io.js';

const HTTPS = { origin: 'https://shop.example.org' };
const HTTP = { origin: 'http://shop.example.org' };
const NOW = new Date('2026-10-22T00:00:00Z');

const goodTls: TlsInfo = {
  protocol: 'TLSv1.3',
  cipher: 'TLS_AES_256_GCM_SHA384',
  authorized: true,
  authorizationError: null,
  subject: 'shop.example.org',
  issuer: "Let's Encrypt",
  validFrom: 'Sep 1 00:00:00 2026 GMT',
  validTo: 'Dec 30 00:00:00 2026 GMT',
  keyBits: 2048,
  selfSigned: false,
  hostnameMatches: true,
  acceptsTls10: false,
  acceptsTls11: false,
};

const res = (
  headers: Record<string, string>,
  setCookies: string[] = [],
  status = 200,
): PinnedResponse => ({
  status,
  headers,
  setCookies,
});

const ids = (drafts: { vulnType: string }[]) =>
  drafts.map((d) => d.vulnType).sort();

const fullHeaders = {
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'content-security-policy': "default-src 'self'; frame-ancestors 'self'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=()',
};

describe('analyzeTls', () => {
  it('a healthy certificate produces nothing', () => {
    expect(analyzeTls(goodTls, HTTPS, NOW)).toEqual([]);
  });

  it('flags an expired certificate as HIGH and an expiring one by urgency', () => {
    expect(
      analyzeTls(
        { ...goodTls, validTo: 'Oct 1 00:00:00 2026 GMT' },
        HTTPS,
        NOW,
      )[0],
    ).toMatchObject({
      vulnType: 'tls-cert-expired',
      severity: 'HIGH',
    });
    expect(
      analyzeTls(
        { ...goodTls, validTo: 'Oct 25 00:00:00 2026 GMT' },
        HTTPS,
        NOW,
      )[0],
    ).toMatchObject({
      vulnType: 'tls-cert-expiring',
      severity: 'MEDIUM',
    });
    expect(
      analyzeTls(
        { ...goodTls, validTo: 'Nov 15 00:00:00 2026 GMT' },
        HTTPS,
        NOW,
      )[0],
    ).toMatchObject({
      vulnType: 'tls-cert-expiring',
      severity: 'LOW',
    });
  });

  it('flags a broken chain, a self-signed certificate and a hostname mismatch', () => {
    expect(
      ids(
        analyzeTls(
          {
            ...goodTls,
            authorized: false,
            authorizationError: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
          },
          HTTPS,
          NOW,
        ),
      ),
    ).toEqual(['tls-cert-untrusted']);
    expect(
      ids(
        analyzeTls(
          {
            ...goodTls,
            authorized: false,
            selfSigned: true,
            authorizationError: 'DEPTH_ZERO_SELF_SIGNED_CERT',
          },
          HTTPS,
          NOW,
        ),
      ),
    ).toEqual(['tls-cert-self-signed']);
    expect(
      ids(analyzeTls({ ...goodTls, hostnameMatches: false }, HTTPS, NOW)),
    ).toEqual(['tls-cert-hostname-mismatch']);
  });

  it('flags weak keys and legacy protocols, and ignores "not tested"', () => {
    expect(ids(analyzeTls({ ...goodTls, keyBits: 1024 }, HTTPS, NOW))).toEqual([
      'tls-weak-key',
    ]);
    expect(
      ids(
        analyzeTls(
          { ...goodTls, acceptsTls10: true, acceptsTls11: true },
          HTTPS,
          NOW,
        ),
      ),
    ).toEqual(['tls-legacy-protocols']);
    expect(
      analyzeTls(
        { ...goodTls, acceptsTls10: null, acceptsTls11: null },
        HTTPS,
        NOW,
      ),
    ).toEqual([]);
    expect(
      ids(analyzeTls({ ...goodTls, protocol: 'TLSv1' }, HTTPS, NOW)),
    ).toEqual(['tls-negotiated-legacy']);
  });
});

describe('analyzeHeaders', () => {
  it('a fully hardened response produces nothing', () => {
    expect(analyzeHeaders(res(fullHeaders), HTTPS)).toEqual([]);
  });

  it('reports every missing header on HTTPS', () => {
    expect(ids(analyzeHeaders(res({}), HTTPS))).toEqual([
      'header-clickjacking',
      'header-csp-missing',
      'header-hsts-missing',
      'header-nosniff-missing',
      'header-permissions-policy-missing',
      'header-referrer-policy-missing',
    ]);
  });

  it('does not ask a plain-HTTP origin for HSTS', () => {
    expect(ids(analyzeHeaders(res({}), HTTP))).not.toContain(
      'header-hsts-missing',
    );
  });

  it('frame-ancestors in the CSP satisfies the clickjacking check', () => {
    const out = analyzeHeaders(
      res({
        ...fullHeaders,
        'content-security-policy': "default-src 'self'; frame-ancestors 'none'",
      }),
      HTTPS,
    );
    expect(ids(out)).not.toContain('header-clickjacking');
    const old = analyzeHeaders(
      res({
        ...fullHeaders,
        'content-security-policy': "default-src 'self'",
        'x-frame-options': 'DENY',
      }),
      HTTPS,
    );
    expect(ids(old)).toEqual([]);
  });

  it('flags a short HSTS lifetime and weak CSP', () => {
    expect(
      ids(
        analyzeHeaders(
          res({ ...fullHeaders, 'strict-transport-security': 'max-age=300' }),
          HTTPS,
        ),
      ),
    ).toEqual(['header-hsts-weak']);
    const weak = analyzeHeaders(
      res({
        ...fullHeaders,
        'content-security-policy':
          "default-src *; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; frame-ancestors 'self'",
      }),
      HTTPS,
    );
    expect(weak).toHaveLength(1);
    expect(weak[0]).toMatchObject({
      vulnType: 'header-csp-weak',
      severity: 'MEDIUM',
    });
  });

  it("'unsafe-inline' next to a nonce is not flagged", () => {
    const out = analyzeHeaders(
      res({
        ...fullHeaders,
        'content-security-policy':
          "script-src 'nonce-abc' 'unsafe-inline'; frame-ancestors 'self'",
      }),
      HTTPS,
    );
    expect(ids(out)).toEqual([]);
  });

  it('every draft carries a fix, a CONFIRMED confidence and an origin-specific signature', () => {
    for (const d of analyzeHeaders(res({}), HTTPS)) {
      expect(d.remediation.length).toBeGreaterThan(20);
      expect(d.confidence).toBe('CONFIRMED');
      expect(d.signature).toContain('@https://shop.example.org');
    }
  });
});

describe('analyzeDisclosure', () => {
  it('flags a versioned Server header and technology headers, not a bare product name', () => {
    expect(
      ids(
        analyzeDisclosure(
          res({ server: 'nginx/1.18.0', 'x-powered-by': 'Express' }),
          HTTPS,
        ),
      ),
    ).toEqual(['disclosure-server-version', 'disclosure-x-powered-by']);
    expect(analyzeDisclosure(res({ server: 'nginx' }), HTTPS)).toEqual([]);
  });
});

describe('cookies', () => {
  it('parses attributes', () => {
    expect(
      parseSetCookie('sid=abc; Path=/; Secure; HttpOnly; SameSite=Lax'),
    ).toEqual({
      name: 'sid',
      secure: true,
      httpOnly: true,
      sameSite: 'lax',
    });
    expect(parseSetCookie('=broken')).toBeNull();
  });

  it('a well-formed cookie is clean', () => {
    expect(
      analyzeCookies(
        res({}, ['sid=abc; Secure; HttpOnly; SameSite=Lax']),
        HTTPS,
      ),
    ).toEqual([]);
  });

  it('flags missing Secure, HttpOnly and SameSite, more severely for session cookies', () => {
    const out = analyzeCookies(
      res({}, ['session=abc123', 'theme=dark']),
      HTTPS,
    );
    const bySig = Object.fromEntries(out.map((d) => [d.vulnType, d.severity]));
    expect(bySig['cookie-no-secure:session']).toBe('MEDIUM');
    expect(bySig['cookie-no-httponly:session']).toBe('MEDIUM');
    expect(bySig['cookie-no-samesite:session']).toBe('LOW');
    expect(bySig['cookie-no-secure:theme']).toBe('LOW');
  });

  it('does not require Secure over plain HTTP, and flags SameSite=None without Secure', () => {
    expect(
      ids(analyzeCookies(res({}, ['a=1; HttpOnly; SameSite=Lax']), HTTP)),
    ).toEqual([]);
    expect(
      ids(analyzeCookies(res({}, ['a=1; HttpOnly; SameSite=None']), HTTP)),
    ).toEqual(['cookie-samesite-none-insecure:a']);
  });

  it('never puts a cookie value into a finding', () => {
    const out = analyzeCookies(
      res({ 'content-type': 'text/html' }, ['session=SUPER-SECRET-VALUE']),
      HTTPS,
    );
    expect(out.length).toBeGreaterThan(0);
    expect(JSON.stringify(out)).not.toContain('SUPER-SECRET-VALUE');
  });
});

describe('analyzeCors', () => {
  const probe = CORS_PROBE_ORIGIN;
  it('nothing without an Access-Control-Allow-Origin header', () => {
    expect(analyzeCors(res({}), HTTPS, probe)).toEqual([]);
  });
  it('an echoed origin with credentials is HIGH, without credentials MEDIUM', () => {
    expect(
      analyzeCors(
        res({
          'access-control-allow-origin': probe,
          'access-control-allow-credentials': 'true',
        }),
        HTTPS,
        probe,
      )[0],
    ).toMatchObject({
      vulnType: 'cors-reflected-credentials',
      severity: 'HIGH',
    });
    expect(
      analyzeCors(
        res({ 'access-control-allow-origin': probe }),
        HTTPS,
        probe,
      )[0],
    ).toMatchObject({
      vulnType: 'cors-reflected',
      severity: 'MEDIUM',
    });
  });
  it('wildcard, wildcard with credentials and null', () => {
    expect(
      analyzeCors(res({ 'access-control-allow-origin': '*' }), HTTPS, probe)[0],
    ).toMatchObject({ severity: 'INFO' });
    expect(
      analyzeCors(
        res({
          'access-control-allow-origin': '*',
          'access-control-allow-credentials': 'true',
        }),
        HTTPS,
        probe,
      )[0],
    ).toMatchObject({
      vulnType: 'cors-wildcard-credentials',
      severity: 'MEDIUM',
    });
    expect(
      analyzeCors(
        res({ 'access-control-allow-origin': 'null' }),
        HTTPS,
        'null',
      )[0],
    ).toMatchObject({
      vulnType: 'cors-null-origin',
    });
  });
  it('a fixed allow-list entry that is not the probe is fine', () => {
    expect(
      analyzeCors(
        res({ 'access-control-allow-origin': 'https://app.example.org' }),
        HTTPS,
        probe,
      ),
    ).toEqual([]);
  });
});

describe('analyzeHttpToHttps', () => {
  it('a redirect to https is fine, anything else is flagged', () => {
    expect(
      analyzeHttpToHttps(
        res({ location: 'https://shop.example.org/' }, [], 301),
        HTTP,
        'https://shop.example.org',
      ),
    ).toEqual([]);
    expect(
      analyzeHttpToHttps(res({}, [], 200), HTTP, 'https://shop.example.org')[0],
    ).toMatchObject({
      vulnType: 'http-no-redirect-to-https',
    });
    expect(
      analyzeHttpToHttps(
        res({ location: 'http://elsewhere.test/' }, [], 302),
        HTTP,
        'https://shop.example.org',
      ),
    ).toHaveLength(1);
  });
});
