"use client";

import * as React from "react";
import Image from "next/image";
import { usePrefersReducedMotion } from "@/lib/hooks/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";

/// The "S" mark cut into three diagonal bands that drop in one after another.
/// Clip polygons follow the S's diagonal strokes; each band overlaps its
/// neighbour by a hair so no seam shows.
const PIECES = [
  { className: "br-p1", clip: "polygon(0 0, 100% 0, 100% 47%, 0 31%)" },
  { className: "br-p2", clip: "polygon(0 30%, 100% 46%, 100% 71%, 0 57%)" },
  { className: "br-p3", clip: "polygon(0 56%, 100% 70%, 100% 100%, 0 100%)" },
] as const;

/// Animated brand lockup: mark assembles, `secora.group` wipes out from
/// behind it, the tagline fades in. Plays once when scrolled into view and
/// again on click. With reduced motion the final lockup is shown statically.
export function BrandReveal({ size = 72, className }: { size?: number; className?: string }) {
  const reducedMotion = usePrefersReducedMotion();
  const ref = React.useRef<HTMLDivElement>(null);
  const [seen, setSeen] = React.useState(false);
  const [run, setRun] = React.useState(0);

  React.useEffect(() => {
    const node = ref.current;
    if (!node || reducedMotion) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [reducedMotion]);

  const state = reducedMotion ? "" : seen ? "br-play" : "br-idle";

  return (
    <div
      ref={ref}
      onClick={() => {
        if (!reducedMotion) {
          setSeen(true);
          setRun((n) => n + 1);
        }
      }}
      className={cn("flex items-center gap-4 select-none", state, className)}
    >
      {/* `key` remounts the animated subtree so a click replays it. */}
      <div key={run} className="flex items-center gap-4">
        <div className="relative" style={{ width: size, height: size }} aria-hidden="true">
          <div className="br-glow pointer-events-none absolute -inset-4 rounded-full bg-primary/40 opacity-0 blur-2xl" />
          {PIECES.map((piece) => (
            <Image
              key={piece.className}
              src="/secora-mark.png"
              alt=""
              width={size}
              height={size}
              priority
              className={cn("br-piece absolute inset-0 object-contain", piece.className)}
              style={{ clipPath: piece.clip }}
            />
          ))}
        </div>
        <div>
          <div className="br-word leading-none font-semibold tracking-tight" style={{ fontSize: size * 1.05 }}>
            {"secora"}
            <span className="text-primary">{"."}</span>
            <span className="font-light">{"group"}</span>
          </div>
          <div
            className="br-tag mt-3 font-medium tracking-[0.35em] text-muted-foreground uppercase"
            style={{ fontSize: Math.max(10, size * 0.2) }}
          >
            {"Security is a process"}
          </div>
        </div>
      </div>
    </div>
  );
}
