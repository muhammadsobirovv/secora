"use client";

import * as React from "react";
import { usePrefersReducedMotion } from "@/lib/hooks/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";
import { TRACK_LITERAL, type ConsoleTone } from "./track-content";
import type { Track } from "./track";

const TONE: Record<ConsoleTone, string> = {
  ok: "text-sev-ok",
  muted: "text-muted-foreground",
  high: "text-primary",
  med: "text-sev-high",
};

/// A decorative console that types out a sample scan (red) or a monitoring
/// session (blue) line by line, then loops. Shows the full output statically
/// when the visitor prefers reduced motion.
export function TrackConsole({ track }: { track: Track }) {
  const literal = TRACK_LITERAL[track];
  const reducedMotion = usePrefersReducedMotion();
  const total = literal.consoleLines.length + 1; // the command, then its output
  const [visible, setVisible] = React.useState(total);

  React.useEffect(() => {
    if (reducedMotion) {
      setVisible(total);
      return;
    }
    let cancelled = false;
    let timer = 0;
    const step = (count: number) => {
      if (cancelled) return;
      setVisible(count);
      const wait = count >= total ? 5000 : 550 + (count % 3) * 150;
      timer = window.setTimeout(() => step(count >= total ? 0 : count + 1), wait);
    };
    step(0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [reducedMotion, total, track]);

  return (
    <div className="border border-border bg-black/60 shadow-[0_0_70px_-25px_var(--track-glow)]">
      <div className="flex justify-between border-b border-border px-4 py-2 text-[11px] tracking-[0.1em] text-muted-foreground uppercase">
        <span>{literal.consoleName}</span>
        <span className="text-sev-ok">{"● connected"}</span>
      </div>
      <div className="min-h-52 p-5 text-[13px] leading-[1.85] break-words whitespace-pre-wrap text-foreground/80">
        {visible > 0 && (
          <div className="trk-line">
            <span className="text-primary">{literal.prompt}</span>
            {` ${literal.consoleCommand}`}
          </div>
        )}
        {literal.consoleLines.slice(0, Math.max(0, visible - 1)).map((line) => (
          <div key={line.time} className="trk-line">
            <span className="text-muted-foreground">{line.time}</span>{" "}
            <span className={cn(TONE[line.tone])}>{line.tag}</span>
            {` ${line.text}`}
          </div>
        ))}
        {visible >= total && (
          <span aria-hidden="true" className="signal-caret text-primary">
            {"▍"}
          </span>
        )}
      </div>
    </div>
  );
}
