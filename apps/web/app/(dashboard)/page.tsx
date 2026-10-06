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
export const metadata: Metadata = {
  title: "PentestHub AI — AI-Powered Offensive Security Platform",
  description:
    "Recon, vulnerability scanning, bug bounty workflow, and an AI security copilot in one workspace. Find vulnerabilities before attackers do.",
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

export default function MarketingHomePage() {
  return <LandingPage />;
}
