import * as React from "react";
import { cn } from "@/lib/utils";
import type { Track } from "./track";

// The "S" outline (traced from the brand mark) in a 256-unit box.
const S_POINTS =
  "130,2 47,46 30,58 30,109 33,112 165,179 130,200 124,200 30,147 31,191 68,218 125,253 131,252 162,233 222,190 221,148 81,80 118,59 131,55 222,104 222,55 175,26";

const STOPS = {
  blue: ["#0c9dfd", "#3a5cfc", "#4a3cfc"],
  red: ["#ff5a5f", "#ff2a3d", "#b3101f"],
} as const;

/// The Secora "S" mark: one solid S in the visitor's track color (blue by
/// default). With `animate`, the other team's S starts in front and the two
/// glide past each other, so the logo visibly swaps to the chosen track and
/// then settles as a single clean S (no leftover edge of the other color).
/// Decorative; always rendered next to the product name.
export function TrackMark({
  track,
  size = 28,
  className,
  animate = false,
}: {
  track?: Track | null;
  size?: number;
  className?: string;
  animate?: boolean;
}) {
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, "");
  const front: Track = track === "red" ? "red" : "blue";
  const back: Track = front === "red" ? "blue" : "red";

  const gradient = (t: Track) => (
    <linearGradient id={`${uid}-${t}`} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stopColor={STOPS[t][0]} />
      <stop offset=".55" stopColor={STOPS[t][1]} />
      <stop offset="1" stopColor={STOPS[t][2]} />
    </linearGradient>
  );

  return (
    <svg
      width={size}
      height={size}
      viewBox="-10 -10 266 266"
      aria-hidden="true"
      focusable="false"
      className={cn("shrink-0", className)}
    >
      <defs>
        {gradient("blue")}
        {gradient("red")}
      </defs>
      {/* The other team's S only exists during the swap animation; at rest the
          mark is a single solid S in the track color. */}
      {animate ? (
        <polygon points={S_POINTS} fill={`url(#${uid}-${back})`} className="trk-swap-back" />
      ) : null}
      <polygon
        points={S_POINTS}
        fill={`url(#${uid}-${front})`}
        className={animate ? "trk-swap-front" : undefined}
      />
    </svg>
  );
}
