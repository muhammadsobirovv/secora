"use client";

import * as React from "react";
import { BrandReveal } from "@/components/brand-reveal";
import { useI18n } from "@/features/i18n/i18n-context";
import { usePrefersReducedMotion } from "@/lib/hooks/use-prefers-reduced-motion";
import { CodeRain } from "./code-rain";
import { TRACK_LITERAL } from "./track-content";
import { TRACK_COLOR, TRACK_INTRO_KEY, type Track } from "./track";

const INTRO_MS = 3600;

/// Full-screen brand intro (the Secora "S" assembling, `secora.group`,
/// "Security is a process") in the chosen track's colors. Plays once, right
/// after the gate choice (the gate sets a sessionStorage flag), is skippable,
/// and is never shown to reduced-motion visitors or on later visits.
/// Rendered inside the `data-track` wrapper so it inherits the track theme.
export function TrackIntro({ track }: { track: Track }) {
  const { t } = useI18n();
  const reducedMotion = usePrefersReducedMotion();
  const [show, setShow] = React.useState(false);

  React.useEffect(() => {
    let flagged = false;
    try {
      flagged = sessionStorage.getItem(TRACK_INTRO_KEY) === "1";
      if (flagged) sessionStorage.removeItem(TRACK_INTRO_KEY);
    } catch {
      // Storage blocked: no intro.
    }
    if (flagged && !reducedMotion) setShow(true);
  }, [reducedMotion]);

  React.useEffect(() => {
    if (!show) return;
    const timer = window.setTimeout(() => setShow(false), INTRO_MS);
    return () => window.clearTimeout(timer);
  }, [show]);

  if (!show) return null;

  return (
    <div
      role="presentation"
      className="animate-in fade-in fixed inset-0 z-[100] grid place-items-center overflow-hidden bg-background duration-300"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_45%,color-mix(in_oklab,var(--primary)_26%,transparent),transparent)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-35 [background-image:linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:radial-gradient(ellipse_60%_55%_at_50%_50%,#000,transparent_80%)]"
      />
      <CodeRain color={TRACK_COLOR[track]} className="opacity-20" />

      <div className="relative flex flex-col items-center gap-8 px-4 text-center">
        <div className="scale-[0.3] sm:scale-[0.55] md:scale-[0.75] lg:scale-100">
          <BrandReveal size={120} track={track} />
        </div>
        <p className="font-mono text-xs tracking-[0.16em] text-muted-foreground uppercase">
          {TRACK_LITERAL[track].introLine}
        </p>
      </div>

      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[3px] bg-border">
        <div
          className="h-full bg-primary shadow-[0_0_14px_var(--track-glow)]"
          style={{ animation: `trk-bar ${INTRO_MS}ms linear forwards` }}
        />
      </div>
      <button
        type="button"
        onClick={() => setShow(false)}
        className="absolute right-6 bottom-6 border border-border px-4 py-2 font-mono text-[11px] font-bold tracking-[0.18em] text-muted-foreground uppercase transition-colors hover:border-primary hover:text-primary"
      >
        {`${t("track.intro.skip")} →`}
      </button>
    </div>
  );
}
