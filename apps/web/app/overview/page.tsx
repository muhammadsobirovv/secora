import type { Metadata } from "next";
import { LandingPage } from "@/features/marketing/landing-page";

// "/overview" — the product overview / marketing page (what used to be "/").
// Reachable by everyone, like /docs and /security (see OPEN_PATHS in proxy.ts).
export const metadata: Metadata = {
  title: "Overview",
  alternates: { canonical: "https://secora.group/overview" },
};

export default function OverviewPage() {
  return <LandingPage />;
}
