import type { MetadataRoute } from "next";

const SITE_URL = "https://pentesthubai.com";

// SEO fix — previously there was no robots.txt at all, so crawlers had no
// explicit signal about what's public. The overwhelming majority of the
// app requires a login (proxy.ts redirects unauthenticated requests to
// /login for anything not in its public-path allowlist), so there is
// nothing useful to gain by inviting crawlers into it — but "/", "/docs",
// and the auth entry pages are genuinely public and should be indexed.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/docs", "/docs/", "/legal/", "/security", "/.well-known/security.txt", "/login", "/register"],
        disallow: [
          "/dashboard",
          "/pricing",
          "/settings",
          "/workspace",
          "/projects",
          "/targets",
          "/notes",
          "/evidence",
          "/recon",
          "/vuln",
          "/bugbounty",
          "/soc",
          "/executive-security",
          "/exposure",
          "/intel",
          "/security-reports",
          "/research-sessions",
          "/terminal",
          "/playbooks",
          "/ai",
          "/agent",
          "/knowledge-base",
          "/activity",
          "/admin",
          "/mfa-challenge",
          "/oauth",
          "/verify-email",
          "/reset-password",
          "/forgot-password",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
