import type { Metadata } from "next";
import { LandingPage } from "@/features/marketing/landing-page";

// "/" — the public marketing landing page. It lives inside the (dashboard)
// route group (so DashboardShell can special-case it — see that file) but
// is NOT gated by auth: proxy.ts treats "/" as public, and DashboardShell
// renders these children with no sidebar/header chrome for signed-out
// visitors. A signed-in visitor never actually reaches this component —
// proxy.ts redirects them to "/dashboard" (the real authenticated home,
// moved from here) at the edge.
//
// SEO fix: previously the entire app — including "/" — required a login,
// so search engines had nothing public to crawl or index. This page is a
// server component (metadata below is server-only) that renders static,
// server-rendered marketing content.
const META_DESCRIPTION =
  "Recon, vulnerability scanning, bug bounty workflow, and an AI security copilot in one workspace. Find vulnerabilities before attackers do.";

export const metadata: Metadata = {
  title: "PentestHub AI — AI-Powered Offensive Security Platform",
  description: META_DESCRIPTION,
  openGraph: {
    title: "PentestHub AI — AI-Powered Offensive Security Platform",
    description:
      "Recon, vulnerability scanning, bug bounty workflow, and an AI security copilot in one workspace.",
    url: "https://pentesthubai.com",
    siteName: "PentestHub AI",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PentestHub AI — AI-Powered Offensive Security Platform",
    description:
      "Recon, vulnerability scanning, bug bounty workflow, and an AI security copilot in one workspace.",
  },
  alternates: {
    canonical: "https://pentesthubai.com",
  },
};

const SITE_URL = "https://pentesthubai.com";
const FOUNDER_ID = `${SITE_URL}/#founder`;
const ORG_ID = `${SITE_URL}/#organization`;
const LINKEDIN = "https://www.linkedin.com/in/muhammadsobirov";
const GITHUB = "https://github.com/dotuz";
const X_PROFILE = "https://x.com/Immukhammed";

// schema.org structured data (Knowledge Panel signals). Static, no user
// input; "<" is escaped so the JSON can never close the script tag.
type JsonLdNode = { "@type": string; "@id"?: string } & Record<string, unknown>;
interface JsonLdGraph {
  "@context": "https://schema.org";
  "@graph": JsonLdNode[];
}

const structuredData: JsonLdGraph = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": ORG_ID,
      name: "PentestHub AI",
      url: SITE_URL,
      logo: `${SITE_URL}/favicon.ico`,
      description: META_DESCRIPTION,
      founder: { "@id": FOUNDER_ID },
      sameAs: [GITHUB, X_PROFILE],
    },
    {
      "@type": "Person",
      "@id": FOUNDER_ID,
      name: "Muhammad Sobirov",
      jobTitle: "Founder & CEO",
      worksFor: { "@id": ORG_ID },
      sameAs: [LINKEDIN, GITHUB, X_PROFILE],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "PentestHub AI",
      publisher: { "@id": ORG_ID },
    },
  ],
};

export default function MarketingHomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />
      <LandingPage />
    </>
  );
}
