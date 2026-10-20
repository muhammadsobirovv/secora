import { TrackMark } from "@/features/track/track-mark";

/// The Secora "S" mark in its default form: blue in front, red copy behind
/// (same as the favicon). Track pages pass their own track to `TrackMark`
/// instead. Decorative: always rendered next to the product name.
export function BrandMark({ size = 28, className }: { size?: number; className?: string }) {
  return <TrackMark size={size} className={className} />;
}
