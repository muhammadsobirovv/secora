import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE_NAME = "pentesthub_session";
const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/mfa-challenge",
  "/oauth/callback",
];

/// Production incident (post-Module-18 launch): the CSP built in
/// next.config.js's `headers()` shipped `script-src 'self'` with no
/// `'unsafe-inline'`/nonce, on the stated assumption that the App
/// Router's hydration payload is inert (`type="application/json"`) and
/// that this codebase has no inline `<script>` usage. That's true of
/// *this app's own* code, but not of Next 16's Turbopack/RSC runtime
/// itself — it injects genuine executable `<script>` tags (the
/// `self.__next_f.push(...)` streaming-payload chunks) that a strict
/// `script-src 'self'` blocks, which made every page render blank in
/// production (confirmed via browser console: repeated "Executing
/// inline script violates ... script-src 'self'" errors, one per
/// injected chunk). `next.config.js`'s `headers()` can only emit a
/// static, build-time CSP — it has no way to mint a per-request nonce —
/// so CSP generation moves here instead, where a fresh nonce is minted
/// per request and threaded to Next's renderer via the `x-nonce`
/// request header (the documented mechanism, see
/// https://nextjs.org/docs/app/guides/content-security-policy): Next's
/// own injected scripts pick up the nonce from the CSP response header
/// automatically, no `app/layout.tsx` changes needed since this
/// codebase has no hand-written inline scripts to thread it through
/// manually. `next.config.js` no longer sets a `Content-Security-Policy`
/// header at all -- two CSP headers on one response are enforced as an
/// AND of both policies, so a second, nonce-less `script-src` there
/// would silently re-block everything this file just allowed.
const apiUrl = new URL(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000");
const apiOrigin = apiUrl.origin;
const apiWsOrigin = `${apiUrl.protocol === "https:" ? "wss:" : "ws:"}//${apiUrl.host}`;

function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    // 'strict-dynamic': lets nonce-trusted scripts (Next's own runtime)
    // load the additional chunks they need without each one requiring
    // its own nonce/hash — standard pairing with a per-request nonce.
    // Browsers that don't support strict-dynamic fall back to 'self'.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // Same 'unsafe-inline' trade-off as before — see the removed
    // next.config.js comment this was migrated from: React's
    // style={{...}} prop renders as an inline style attribute, which
    // style-src governs the same as a <style> tag.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' ${apiOrigin} ${apiWsOrigin}`,
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

/// This is a UX nicety only — redirects at the edge based on a plain
/// (non-httpOnly) marker cookie so an unauthenticated visitor doesn't see
/// a flash of dashboard chrome before client-side JS redirects them. It
/// is NOT the security boundary: the cookie is just a presence flag, not
/// a credential, and every API request is still independently
/// authorized by the backend's JWT validation (see
/// docs/adr/0002-workspace-foundation-module.md, Decision 4).
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE_NAME);
  const isPublicPath = PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  const nonce = crypto.randomUUID().replace(/-/g, "");
  const csp = buildCsp(nonce);

  if (!hasSession && !isPublicPath) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    const response = NextResponse.redirect(loginUrl);
    response.headers.set("Content-Security-Policy", csp);
    return response;
  }

  if (hasSession && isPublicPath && pathname !== "/oauth/callback") {
    const response = NextResponse.redirect(new URL("/", request.url));
    response.headers.set("Content-Security-Policy", csp);
    return response;
  }

  // Forwarding the nonce as a *request* header (not just setting it on
  // the response) is what lets Next's server-side renderer read it back
  // out via headers() during this same request and stamp it onto the
  // scripts it emits.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)"],
};
