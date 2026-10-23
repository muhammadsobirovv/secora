import { createHash } from 'node:crypto';
import type { VerificationStatus } from '@pentesthub/shared';

/// Safe re-verification of findings, for four classes only:
///   exposed-file   - the file is still served (and is not a catch-all page)
///   missing-header - the response still lacks the header
///   open-redirect  - the same URL still redirects to another host
///   reflected-xss  - a harmless marker is still reflected unencoded
///
/// Every check is ONE GET (exposed-file also fetches one made-up path on the
/// same origin, cached, to tell a real file from a catch-all page). No request
/// carries a payload that changes data, nothing is submitted, no credentials
/// are tried. The fetch is injected: the worker passes one that goes through
/// the pinning proxy, so the same host/port/pin rules apply as for every other
/// tool.
///
/// "Reproduced" is the only result that makes a finding CONFIRMED. Anything
/// else leaves it LIKELY and records why.

export interface VerifiableFinding {
  id: string;
  scanner: string;
  vulnType: string;
  signature: string;
  path: string | null;
  matchedAt: string;
  tags: string[];
  data: Record<string, unknown>;
}

export type VerifyKind =
  'exposed-file' | 'missing-header' | 'open-redirect' | 'reflected-xss';

export interface VerifyPlan {
  kind: VerifyKind;
  findingId: string;
  /// The one URL fetched for this check.
  url: string;
  /// missing-header: which issue; open-redirect/xss: details.
  vulnType: string;
  param?: string;
}

export interface FetchedResponse {
  status: number;
  headers: Record<string, string>;
  /// At most the first `maxBytes` of the body, as text.
  body: string;
}

export type FetchOnce = (
  url: string,
  options: { maxBytes: number },
) => Promise<FetchedResponse>;

export interface VerificationOutcome {
  status: VerificationStatus;
  method: VerifyKind;
  checkedAt: string;
  detail: string;
}

/// The marker reflected-xss checks send. Letters, then characters an unencoded
/// reflection would keep and an encoded one would turn into entities. It cannot
/// execute anything.
export const XSS_MARKER = 'secoramk<x"y>';

const HEADER_CHECKS: Record<
  string,
  (headers: Record<string, string>) => { reproduced: boolean; detail: string }
> = {
  'header-hsts-missing': (h) => ({
    reproduced: !h['strict-transport-security'],
    detail: 'Strict-Transport-Security',
  }),
  'header-csp-missing': (h) => ({
    reproduced: !h['content-security-policy'],
    detail: 'Content-Security-Policy',
  }),
  'header-nosniff-missing': (h) => ({
    reproduced: (h['x-content-type-options'] ?? '').toLowerCase() !== 'nosniff',
    detail: 'X-Content-Type-Options',
  }),
  'header-referrer-policy-missing': (h) => ({
    reproduced: !h['referrer-policy'],
    detail: 'Referrer-Policy',
  }),
  'header-permissions-policy-missing': (h) => ({
    reproduced: !h['permissions-policy'],
    detail: 'Permissions-Policy',
  }),
  'header-clickjacking': (h) => ({
    reproduced:
      !h['x-frame-options'] &&
      !/frame-ancestors/i.test(h['content-security-policy'] ?? ''),
    detail: 'X-Frame-Options / frame-ancestors',
  }),
};

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function planVerification(f: VerifiableFinding): VerifyPlan | null {
  const url = parseUrl(f.matchedAt);

  if (f.scanner === 'SECORA_CHECKS' && HEADER_CHECKS[f.vulnType] && url) {
    return {
      kind: 'missing-header',
      findingId: f.id,
      url: `${url.origin}/`,
      vulnType: f.vulnType,
    };
  }

  if (f.scanner === 'DALFOX') {
    const full = typeof f.data.url === 'string' ? parseUrl(f.data.url) : null;
    const param = typeof f.data.param === 'string' ? f.data.param : null;
    const method =
      typeof f.data.method === 'string' ? f.data.method.toUpperCase() : 'GET';
    if (full && param && method === 'GET') {
      return {
        kind: 'reflected-xss',
        findingId: f.id,
        url: full.toString(),
        vulnType: f.vulnType,
        param,
      };
    }
    return null;
  }

  if (f.scanner === 'NUCLEI' && url) {
    const template = String(f.data.templateId ?? f.signature).toLowerCase();
    if (f.tags.includes('redirect') || /redirect/.test(template)) {
      return {
        kind: 'open-redirect',
        findingId: f.id,
        url: url.toString(),
        vulnType: f.vulnType,
      };
    }
    if (
      f.tags.some((tag) =>
        ['exposure', 'config', 'backup', 'file'].includes(tag),
      ) &&
      url.pathname !== '/'
    ) {
      return {
        kind: 'exposed-file',
        findingId: f.id,
        url: url.toString(),
        vulnType: f.vulnType,
      };
    }
    return null;
  }

  if (f.scanner === 'FFUF' && url && url.pathname !== '/') {
    const status = Number(f.data.status ?? 0);
    // Only a path that was actually served is worth re-checking.
    if (status >= 200 && status < 300) {
      return {
        kind: 'exposed-file',
        findingId: f.id,
        url: url.toString(),
        vulnType: f.vulnType,
      };
    }
  }
  return null;
}

const hash = (text: string) => createHash('sha256').update(text).digest('hex');

export interface VerifyContext {
  fetch: FetchOnce;
  now: () => Date;
  /// Baseline responses for made-up paths, cached per origin.
  baselines: Map<string, Promise<FetchedResponse | null>>;
  randomPath: () => string;
}

export function createVerifyContext(
  fetch: FetchOnce,
  options: Partial<Pick<VerifyContext, 'now' | 'randomPath'>> = {},
): VerifyContext {
  return {
    fetch,
    now: options.now ?? (() => new Date()),
    baselines: new Map(),
    randomPath:
      options.randomPath ??
      (() => `/secora-baseline-${Math.random().toString(36).slice(2, 10)}`),
  };
}

function outcome(
  plan: VerifyPlan,
  ctx: VerifyContext,
  status: VerificationStatus,
  detail: string,
): VerificationOutcome {
  return {
    status,
    method: plan.kind,
    checkedAt: ctx.now().toISOString(),
    detail,
  };
}

export async function verifyFinding(
  plan: VerifyPlan,
  ctx: VerifyContext,
): Promise<VerificationOutcome> {
  if (plan.kind === 'reflected-xss') return verifyReflectedXss(plan, ctx);

  let response: FetchedResponse;
  try {
    response = await ctx.fetch(plan.url, { maxBytes: 256 * 1024 });
  } catch (error) {
    return outcome(
      plan,
      ctx,
      'FAILED',
      `The re-check could not be made: ${(error as Error).message}`,
    );
  }

  switch (plan.kind) {
    case 'missing-header': {
      if (response.status >= 300 && response.status < 400) {
        return outcome(
          plan,
          ctx,
          'FAILED',
          `The page redirected (HTTP ${response.status}), so its headers were not judged.`,
        );
      }
      const check = HEADER_CHECKS[plan.vulnType](response.headers);
      return check.reproduced
        ? outcome(
            plan,
            ctx,
            'REPRODUCED',
            `${check.detail} is still absent (HTTP ${response.status}).`,
          )
        : outcome(
            plan,
            ctx,
            'NOT_REPRODUCED',
            `${check.detail} is present now.`,
          );
    }

    case 'exposed-file': {
      if (
        response.status < 200 ||
        response.status >= 300 ||
        response.body.length === 0
      ) {
        return outcome(
          plan,
          ctx,
          'NOT_REPRODUCED',
          `The path answered HTTP ${response.status}${response.body.length === 0 ? ' with an empty body' : ''}.`,
        );
      }
      const url = new URL(plan.url);
      const key = url.origin;
      let baseline = ctx.baselines.get(key);
      if (!baseline) {
        baseline = ctx
          .fetch(`${url.origin}${ctx.randomPath()}`, { maxBytes: 256 * 1024 })
          .catch(() => null);
        ctx.baselines.set(key, baseline);
      }
      const base = await baseline;
      if (
        base &&
        base.status >= 200 &&
        base.status < 300 &&
        hash(base.body) === hash(response.body)
      ) {
        return outcome(
          plan,
          ctx,
          'NOT_REPRODUCED',
          'The site answers every path with the same page, so this is not a real file.',
        );
      }
      return outcome(
        plan,
        ctx,
        'REPRODUCED',
        `The path is served (HTTP ${response.status}, ${response.body.length} bytes) and differs from the site's not-found answer.`,
      );
    }

    case 'open-redirect': {
      const location = response.headers.location;
      if (response.status < 300 || response.status >= 400 || !location) {
        return outcome(
          plan,
          ctx,
          'NOT_REPRODUCED',
          `The URL answered HTTP ${response.status} without a redirect.`,
        );
      }
      const origin = new URL(plan.url);
      const target = parseUrl(new URL(location, origin).toString());
      if (
        target &&
        target.host.toLowerCase() !== origin.host.toLowerCase() &&
        plan.url.toLowerCase().includes(target.hostname.toLowerCase())
      ) {
        return outcome(
          plan,
          ctx,
          'REPRODUCED',
          `The request still redirects to ${target.host}, a host named in the URL.`,
        );
      }
      return outcome(
        plan,
        ctx,
        'NOT_REPRODUCED',
        'The redirect no longer leaves the site, or does not follow the URL.',
      );
    }
  }
}

/// The finding's stored URL carries the scanner's payload, so it is never
/// requested again: only the parameter is replaced with the harmless marker.
async function verifyReflectedXss(
  plan: VerifyPlan,
  ctx: VerifyContext,
): Promise<VerificationOutcome> {
  const url = new URL(plan.url);
  url.searchParams.set(plan.param ?? '', XSS_MARKER);
  let marked: FetchedResponse;
  try {
    marked = await ctx.fetch(url.toString(), { maxBytes: 256 * 1024 });
  } catch (error) {
    return outcome(
      plan,
      ctx,
      'FAILED',
      `The re-check could not be made: ${(error as Error).message}`,
    );
  }
  const html = /html|xml/i.test(marked.headers['content-type'] ?? '');
  if (
    marked.status >= 200 &&
    marked.status < 300 &&
    html &&
    marked.body.includes(XSS_MARKER)
  ) {
    return outcome(
      plan,
      ctx,
      'REPRODUCED',
      `A harmless marker sent in "${plan.param}" came back unencoded (HTTP ${marked.status}).`,
    );
  }
  return outcome(
    plan,
    ctx,
    'NOT_REPRODUCED',
    `The marker was not reflected unencoded (HTTP ${marked.status}).`,
  );
}
