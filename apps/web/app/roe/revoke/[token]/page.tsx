import type { Metadata } from "next";
import { PublicRoeView } from "@/features/roe/public-roe-view";

export const metadata: Metadata = {
  title: "Withdraw approval",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function RevokeRoePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicRoeView token={token} mode="revoke" />;
}
