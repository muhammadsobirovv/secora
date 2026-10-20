import type { Metadata } from "next";
import { TrackPage } from "@/features/track/track-page";

// "/red" — the offensive (red team) track page. Public; proxy.ts lets
// signed-out visitors in and sends signed-in ones to the dashboard.
export const metadata: Metadata = {
  title: "Red Team",
  description: "Find the attack path before the adversary does: recon, scanning and reporting in one console.",
  alternates: { canonical: "https://secora.group/red" },
};

export default function RedTrackPage() {
  return <TrackPage track="red" />;
}
