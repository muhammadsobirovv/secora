import type { Metadata } from "next";
import { TrackPage } from "@/features/track/track-page";

// "/blue" — the defensive (blue team) track page. Public; proxy.ts lets
// signed-out visitors in and sends signed-in ones to the dashboard.
export const metadata: Metadata = {
  title: "Blue Team",
  description: "Monitor your assets, detect threats and manage incidents and remediation in one place.",
  alternates: { canonical: "https://secora.group/blue" },
};

export default function BlueTrackPage() {
  return <TrackPage track="blue" />;
}
