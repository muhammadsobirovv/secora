import type { MetadataRoute } from "next";
import { listAllDocs } from "@/lib/docs-content";

const SITE_URL = "https://pentesthubai.com";

// Lists only genuinely public, unauthenticated routes: the marketing home,
// the allowlisted user docs (lib/docs-content.ts — the same list the docs
// page pre-renders, so no URL here can 404), the legal and security pages,
// and the auth entry pages. Everything else requires a login and has no
// business being indexed.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/docs`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/security`, lastModified: now, changeFrequency: "yearly", priority: 0.4 },
    { url: `${SITE_URL}/legal/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/legal/acceptable-use`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/legal/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/login`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/register`, lastModified: now, changeFrequency: "yearly", priority: 0.5 },
  ];

  const docRoutes: MetadataRoute.Sitemap = listAllDocs().map((doc) => ({
    url: `${SITE_URL}/docs/${doc.slug}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  return [...staticRoutes, ...docRoutes];
}
