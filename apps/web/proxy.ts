import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE_NAME = "secora_session";
const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/mfa-challenge",
  "/oauth/callback",
];

// Reachable by everyone, signed in or not — never redirected either way.
// robots.txt/sitemap.xml must answer crawlers (which have no session),
// and the /docs portal (app/docs, outside the (dashboard) group) is
// public reference material a signed-in user should still be able to read.
// /.well-known holds security.txt (RFC 9116); /legal/* and /security are
// the public legal and vulnerability-disclosure pages. /shared/<token> is a
// shared scan report: the unguessable token in the URL is its credential. /roe/approve|revoke/<token> are the client's one-time
// approval pages (no login).
const OPEN_PATHS = ["/docs", "/robots.txt", "/sitemap.xml", "/.well-known", "/legal", "/security", "/overview", "/shared", "/roe"];

// The two public track pages (red = offensive, blue = defensive). Matched
// exactly, like "/", and handled like the landing: open to signed-out
// visitors, a signed-in visitor is sent on to the dashboard.
const TRACK_PATHS = ["/red", "/blue"];

/// This is a UX nicety only — redirects at the edge based on a plain
/// (non-httpOnly) marker cookie so an unauthenticated visitor doesn't see
/// a flash of dashboard chrome before client-side JS redirects them. It
/// is NOT the security boundary: the cookie is just a presence flag, not
/// a credential, and every API request is still independently
/// authorized by the backend's JWT validation (see
/// docs/adr/0002-workspace-foundation-module.md, Decision 4).
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (OPEN_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next();
  }

  const hasSession = request.cookies.has(SESSION_COOKIE_NAME);
  // "/" is the public marketing/landing page (app/page.tsx), not the
  // dashboard — the authenticated home moved to "/dashboard". It's
  // matched exactly (not via startsWith, which would otherwise make
  // every path "public") alongside the auth-flow paths below.
  const isPublicPath =
    pathname === "/" ||
    TRACK_PATHS.includes(pathname) ||
    PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  if (!hasSession && !isPublicPath) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // An already-signed-in visitor doesn't need the login/register forms or
  // the marketing landing page — send them straight into the app. "/" is
  // included here (not just PUBLIC_PATHS) so a logged-in user hitting the
  // bare domain lands on their dashboard instead of the marketing copy.
  if (hasSession && isPublicPath && pathname !== "/oauth/callback") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)"],
};
