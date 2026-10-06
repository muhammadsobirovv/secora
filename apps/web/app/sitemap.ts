import type { MetadataRoute } from "next";
import { listAllDocs } from "@/lib/docs-content";

const SITE_URL = "https://pentesthubai.com";

// SEO fix — paired with app/robots.ts. Lists only genuinely public,
// unauthenticated routes (the marketing home, the doc portal and its
// documents, and the auth entry pages) — everything else requires a
// login and has no business being indexed.
//
// Doc URLs come from listAllDocs(), the same list app/docs/[...slug]'s
// generateStaticParams pre-renders. There is no per-category index page
// (`dynamicParams = false`), so `/docs/<category>` alone would 404.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/docs`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/login`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/register`, lastModified: now, changeFrequency: "yearly", priority: 0.5 },
  ];

  const docRoutes: MetadataRoute.Sitemap = listAllDocs().map((doc) => ({
    url: `${SITE_URL}/docs/${doc.category}/${doc.slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.5,
  }));

  return [...staticRoutes, ...docRoutes];
}
