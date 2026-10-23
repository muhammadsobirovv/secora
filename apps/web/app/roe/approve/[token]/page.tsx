import type { Metadata } from "next";
import { PublicRoeView } from "@/features/roe/public-roe-view";

// A one-time link from an email: never indexed, and the address (which holds
// the token) is not passed on to other sites.
export const metadata: Metadata = {
  title: "Approval request",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ApproveRoePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicRoeView token={token} mode="approve" />;
}
