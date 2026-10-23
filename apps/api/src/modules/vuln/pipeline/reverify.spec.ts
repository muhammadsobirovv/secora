import { describe, expect, it, jest } from '@jest/globals';
import {
  createVerifyContext,
  planVerification,
  verifyFinding,
  XSS_MARKER,
  type FetchOnce,
  type FetchedResponse,
  type VerifiableFinding,
} from './reverify.js';

let n = 0;
const finding = (o: Partial<VerifiableFinding>): VerifiableFinding => ({
  id: `f${++n}`,
  scanner: 'SECORA_CHECKS',
  vulnType: 'header-csp-missing',
  signature: 's',
  path: '/',
  matchedAt: 'https://shop.example.org',
  tags: [],
  data: {},
  ...o,
});

const res = (
  status: number,
  headers: Record<string, string> = {},
  body = '',
): FetchedResponse => ({ status, headers, body });
const NOW = new Date('2026-10-22T10:00:00Z');

function ctx(handler: (url: string) => FetchedResponse | Error) {
  const calls: string[] = [];
  const fetchOnce = jest.fn<FetchOnce>(async (url) => {
    calls.push(url);
    const out = handler(url);
    if (out instanceof Error) throw out;
    return out;
  });
  return {
    calls,
    ctx: createVerifyContext(fetchOnce, {
      now: () => NOW,
      randomPath: () => '/secora-baseline-x',
    }),
  };
}

describe('planVerification — only the four safe classes', () => {
  it('plans a missing-header check against the origin home page', () => {
    expect(
      planVerification(
        finding({
          vulnType: 'header-hsts-missing',
          matchedAt: 'https://shop.example.org/',
        }),
      ),
    ).toMatchObject({
      kind: 'missing-header',
      url: 'https://shop.example.org/',
    });
  });

  it('plans exposed-file checks for served ffuf hits and nuclei exposures, not for protected paths or the root', () => {
    const served = finding({
      scanner: 'FFUF',
      vulnType: 'exposed-content',
      matchedAt: 'https://shop.example.org/.env',
      data: { status: 200 },
    });
    expect(planVerification(served)?.kind).toBe('exposed-file');
    expect(
      planVerification(
        finding({
          scanner: 'FFUF',
          matchedAt: 'https://shop.example.org/.env',
          data: { status: 403 },
        }),
      ),
    ).toBeNull();
    expect(
      planVerification(
        finding({
          scanner: 'FFUF',
          matchedAt: 'https://shop.example.org/',
          data: { status: 200 },
        }),
      ),
    ).toBeNull();
    const nuclei = finding({
      scanner: 'NUCLEI',
      matchedAt: 'https://shop.example.org/.git/config',
      tags: ['exposure'],
      data: { templateId: 'git-config' },
    });
    expect(planVerification(nuclei)?.kind).toBe('exposed-file');
  });

  it('plans open-redirect for redirect templates and reflected-xss for GET dalfox findings with a stored URL', () => {
    const redirect = finding({
      scanner: 'NUCLEI',
      matchedAt: 'https://shop.example.org/go?url=https://evil.example.net',
      tags: ['redirect'],
      data: { templateId: 'open-redirect' },
    });
    expect(planVerification(redirect)?.kind).toBe('open-redirect');
    const xss = finding({
      scanner: 'DALFOX',
      data: {
        param: 'q',
        method: 'GET',
        url: 'https://shop.example.org/s?q=PAYLOAD',
      },
    });
    expect(planVerification(xss)).toMatchObject({
      kind: 'reflected-xss',
      param: 'q',
    });
    expect(
      planVerification(
        finding({
          scanner: 'DALFOX',
          data: {
            param: 'q',
            method: 'POST',
            url: 'https://shop.example.org/s',
          },
        }),
      ),
    ).toBeNull();
    expect(
      planVerification(finding({ scanner: 'DALFOX', data: {} })),
    ).toBeNull();
  });

  it('does not plan anything for classes outside the four (ports, TLS, CORS, cookies, subdomains, other nuclei templates)', () => {
    expect(
      planVerification(
        finding({ scanner: 'NAABU', matchedAt: 'shop.example.org:6379' }),
      ),
    ).toBeNull();
    expect(
      planVerification(finding({ vulnType: 'tls-cert-expired' })),
    ).toBeNull();
    expect(
      planVerification(finding({ vulnType: 'cors-reflected-credentials' })),
    ).toBeNull();
    expect(
      planVerification(finding({ vulnType: 'cookie-no-secure:session' })),
    ).toBeNull();
    expect(
      planVerification(
        finding({ scanner: 'SUBFINDER', matchedAt: 'api.example.org' }),
      ),
    ).toBeNull();
    expect(
      planVerification(
        finding({
          scanner: 'NUCLEI',
          matchedAt: 'https://shop.example.org/x',
          tags: ['cve', 'rce'],
          data: { templateId: 'cve-2024-1' },
        }),
      ),
    ).toBeNull();
  });
});

describe('verifyFinding — missing header', () => {
  const plan = () =>
    planVerification(finding({ vulnType: 'header-csp-missing' }))!;

  it('reproduces when the header is still absent, with one GET', async () => {
    const { ctx: c, calls } = ctx(() => res(200, { server: 'nginx' }));
    const out = await verifyFinding(plan(), c);
    expect(out).toMatchObject({
      status: 'REPRODUCED',
      method: 'missing-header',
      checkedAt: NOW.toISOString(),
    });
    expect(calls).toEqual(['https://shop.example.org/']);
  });

  it('does not reproduce when the header is there now, and does not judge a redirect', async () => {
    expect(
      (
        await verifyFinding(
          plan(),
          ctx(() =>
            res(200, { 'content-security-policy': "default-src 'self'" }),
          ).ctx,
        )
      ).status,
    ).toBe('NOT_REPRODUCED');
    expect(
      (
        await verifyFinding(
          plan(),
          ctx(() => res(301, { location: 'https://shop.example.org/' })).ctx,
        )
      ).status,
    ).toBe('FAILED');
  });

  it('clickjacking is satisfied by frame-ancestors or X-Frame-Options', async () => {
    const p = planVerification(finding({ vulnType: 'header-clickjacking' }))!;
    expect((await verifyFinding(p, ctx(() => res(200, {})).ctx)).status).toBe(
      'REPRODUCED',
    );
    expect(
      (
        await verifyFinding(
          p,
          ctx(() => res(200, { 'x-frame-options': 'DENY' })).ctx,
        )
      ).status,
    ).toBe('NOT_REPRODUCED');
    expect(
      (
        await verifyFinding(
          p,
          ctx(() =>
            res(200, { 'content-security-policy': "frame-ancestors 'self'" }),
          ).ctx,
        )
      ).status,
    ).toBe('NOT_REPRODUCED');
  });

  it('records a failed re-check instead of throwing', async () => {
    const out = await verifyFinding(
      plan(),
      ctx(() => new Error('timed out')).ctx,
    );
    expect(out.status).toBe('FAILED');
    expect(out.detail).toContain('timed out');
  });
});

describe('verifyFinding — exposed file', () => {
  const plan = () =>
    planVerification(
      finding({
        scanner: 'FFUF',
        matchedAt: 'https://shop.example.org/.env',
        data: { status: 200 },
      }),
    )!;

  it('reproduces a real file that differs from the not-found answer', async () => {
    const { ctx: c, calls } = ctx((url) =>
      url.endsWith('/.env')
        ? res(200, {}, 'APP_ENV=lab')
        : res(404, {}, 'Not found'),
    );
    expect((await verifyFinding(plan(), c)).status).toBe('REPRODUCED');
    expect(calls).toEqual([
      'https://shop.example.org/.env',
      'https://shop.example.org/secora-baseline-x',
    ]);
  });

  it('refuses to call a catch-all page a file', async () => {
    const out = await verifyFinding(
      plan(),
      ctx(() => res(200, {}, '<html>app shell</html>')).ctx,
    );
    expect(out.status).toBe('NOT_REPRODUCED');
    expect(out.detail).toContain('every path');
  });

  it('does not reproduce a 404, a 403 or an empty body', async () => {
    expect(
      (await verifyFinding(plan(), ctx(() => res(404, {}, 'x')).ctx)).status,
    ).toBe('NOT_REPRODUCED');
    expect(
      (await verifyFinding(plan(), ctx(() => res(403, {}, 'x')).ctx)).status,
    ).toBe('NOT_REPRODUCED');
    expect(
      (await verifyFinding(plan(), ctx(() => res(200, {}, '')).ctx)).status,
    ).toBe('NOT_REPRODUCED');
  });

  it('fetches the baseline once per origin', async () => {
    const { ctx: c, calls } = ctx((url) =>
      url.includes('baseline') ? res(404) : res(200, {}, 'data'),
    );
    await verifyFinding(plan(), c);
    await verifyFinding(
      planVerification(
        finding({
          scanner: 'FFUF',
          matchedAt: 'https://shop.example.org/.git/HEAD',
          data: { status: 200 },
        }),
      )!,
      c,
    );
    expect(calls.filter((u) => u.includes('baseline'))).toHaveLength(1);
  });
});

describe('verifyFinding — open redirect', () => {
  const plan = () =>
    planVerification(
      finding({
        scanner: 'NUCLEI',
        matchedAt: 'https://shop.example.org/go?url=https://evil.example.net/x',
        tags: ['redirect'],
        data: { templateId: 'open-redirect' },
      }),
    )!;

  it('reproduces when the URL still sends the browser to the host named in it', async () => {
    const out = await verifyFinding(
      plan(),
      ctx(() => res(302, { location: 'https://evil.example.net/x' })).ctx,
    );
    expect(out.status).toBe('REPRODUCED');
  });

  it('does not reproduce a same-site redirect, an unrelated host or no redirect', async () => {
    expect(
      (
        await verifyFinding(
          plan(),
          ctx(() => res(302, { location: '/home' })).ctx,
        )
      ).status,
    ).toBe('NOT_REPRODUCED');
    expect(
      (
        await verifyFinding(
          plan(),
          ctx(() => res(302, { location: 'https://login.example.com/' })).ctx,
        )
      ).status,
    ).toBe('NOT_REPRODUCED');
    expect((await verifyFinding(plan(), ctx(() => res(200)).ctx)).status).toBe(
      'NOT_REPRODUCED',
    );
  });
});

describe('verifyFinding — reflected XSS marker', () => {
  const plan = () =>
    planVerification(
      finding({
        scanner: 'DALFOX',
        data: {
          param: 'q',
          method: 'GET',
          url: 'https://shop.example.org/search?q=%3Csvg%20onload%3Dalert(1)%3E&lang=en',
        },
      }),
    )!;

  it('sends only the harmless marker (never the scanner payload) and reproduces on an unencoded reflection', async () => {
    const { ctx: c, calls } = ctx((url) => {
      const q = new URL(url).searchParams.get('q') ?? '';
      return res(200, { 'content-type': 'text/html' }, `<div>${q}</div>`);
    });
    const out = await verifyFinding(plan(), c);
    expect(out.status).toBe('REPRODUCED');
    expect(calls).toHaveLength(1);
    const sent = new URL(calls[0]);
    expect(sent.searchParams.get('q')).toBe(XSS_MARKER);
    expect(sent.searchParams.get('lang')).toBe('en');
    expect(calls[0]).not.toContain('svg');
    expect(calls[0]).not.toContain('alert');
  });

  it('does not reproduce when the reflection is encoded, absent, or not HTML', async () => {
    const encoded = ctx(() =>
      res(
        200,
        { 'content-type': 'text/html' },
        '<div>secoramk&lt;x&quot;y&gt;</div>',
      ),
    ).ctx;
    expect((await verifyFinding(plan(), encoded)).status).toBe(
      'NOT_REPRODUCED',
    );
    expect(
      (
        await verifyFinding(
          plan(),
          ctx(() => res(200, { 'content-type': 'text/html' }, 'nothing')).ctx,
        )
      ).status,
    ).toBe('NOT_REPRODUCED');
    const json = ctx((url) =>
      res(
        200,
        { 'content-type': 'application/json' },
        `{"q":"${new URL(url).searchParams.get('q')}"}`,
      ),
    ).ctx;
    expect((await verifyFinding(plan(), json)).status).toBe('NOT_REPRODUCED');
  });
});
