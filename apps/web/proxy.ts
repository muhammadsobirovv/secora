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

  if (!hasSession && !isPublicPath) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (hasSession && isPublicPath && pathname !== "/oauth/callback") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)"],
};
