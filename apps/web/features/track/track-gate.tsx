"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/features/i18n/language-switcher";
import { useI18n } from "@/features/i18n/i18n-context";
import { cn } from "@/lib/utils";
import { CodeRain } from "./code-rain";
import { TrackMark } from "./track-mark";
import { trackKeys } from "./track-content";
import { TRACK_COLOR, TRACKS, type Track } from "./track";
import { useChooseTrack } from "./use-choose-track";

/// Per-track visuals of a gate side. The words come from the catalog; only
/// colors and which edge the copy hugs are decided here.
const SIDE_STYLE: Record<Track, { align: string; title: string; pick: string; glow: React.CSSProperties }> = {
  blue: {
    align: "items-start text-left",
    title:
      "text-[#0b3a5e] [-webkit-text-stroke:1px_#2aa7ff] group-hover/side:text-[#2aa7ff] group-hover/side:[text-shadow:0_0_50px_rgba(42,167,255,.5)] group-focus-visible/side:text-[#2aa7ff]",
    pick: "border-[#2aa7ff] text-[#2aa7ff] group-hover/side:bg-[#2aa7ff] group-hover/side:text-[#001423] group-hover/side:shadow-[0_0_30px_rgba(42,167,255,.5)] group-focus-visible/side:bg-[#2aa7ff] group-focus-visible/side:text-[#001423]",
    glow: {
      background:
        "radial-gradient(ellipse 70% 60% at 85% 75%, rgba(42,167,255,.28), transparent 70%), linear-gradient(90deg, #02060c, transparent 85%)",
    },
  },
  red: {
    align: "items-end text-right",
    title:
      "text-[#4a0a12] [-webkit-text-stroke:1px_#ff2a3d] group-hover/side:text-[#ff2a3d] group-hover/side:[text-shadow:0_0_50px_rgba(255,42,61,.5)] group-focus-visible/side:text-[#ff2a3d]",
    pick: "border-[#ff2a3d] text-[#ff2a3d] group-hover/side:bg-[#ff2a3d] group-hover/side:text-[#1a0003] group-hover/side:shadow-[0_0_30px_rgba(255,42,61,.5)] group-focus-visible/side:bg-[#ff2a3d] group-focus-visible/side:text-[#1a0003]",
    glow: {
      background:
        "radial-gradient(ellipse 70% 60% at 15% 75%, rgba(255,42,61,.28), transparent 70%), linear-gradient(270deg, #0c0204, transparent 85%)",
    },
  },
};

function Side({ track }: { track: Track }) {
  const { t } = useI18n();
  const choose = useChooseTrack();
  const keys = trackKeys(track);
  const style = SIDE_STYLE[track];
  const isBlue = track === "blue";

  return (
    <button
      type="button"
      onClick={() => choose(track, { intro: true })}
      className={cn(
        "group/side relative isolate flex min-h-[60svh] flex-1 cursor-pointer flex-col justify-center overflow-hidden px-[6%] pt-40 pb-24 transition-[flex,filter] duration-500 outline-none md:min-h-svh md:hover:flex-[1.55] md:group-hover/split:brightness-50 md:hover:brightness-100! md:focus-visible:brightness-100!",
        style.align,
      )}
    >
      <CodeRain color={TRACK_COLOR[track]} className="-z-20 opacity-50" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10" style={style.glow} />

      <span className={cn("mb-3 text-xs tracking-[0.28em] uppercase", isBlue ? "text-[#2aa7ff]" : "text-[#ff2a3d]")}>
        {isBlue ? `// ${t(keys.label)}` : `${t(keys.label)} //`}
      </span>
      <h3
        className={cn(
          "w-min font-sans text-[clamp(40px,6.4vw,92px)] leading-[0.95] font-black tracking-tight uppercase transition-[color,text-shadow,transform] duration-500 group-hover/side:scale-[1.03]",
          style.title,
        )}
      >
        {t(keys.name)}
      </h3>
      <p className="mt-4 mb-5 max-w-sm text-[15px] text-zinc-400">{t(keys.tagline)}</p>
      <ul
        className={cn(
          "mb-6 space-y-1 overflow-hidden text-[12.5px] tracking-[0.04em] text-zinc-300 transition-[max-height,opacity] duration-500",
          "md:max-h-0 md:opacity-0 md:group-hover/side:max-h-64 md:group-hover/side:opacity-100 md:group-focus-visible/side:max-h-64 md:group-focus-visible/side:opacity-100",
        )}
      >
        {keys.gate.map((key) => (
          <li key={key}>
            {isBlue ? <span className="text-[#2aa7ff]">{"◆ "}</span> : null}
            {t(key)}
            {isBlue ? null : <span className="text-[#ff2a3d]">{" ◆"}</span>}
          </li>
        ))}
      </ul>
      <span
        className={cn(
          "inline-block border px-6 py-3 text-xs font-bold tracking-[0.18em] uppercase transition-all [clip-path:polygon(10px_0,100%_0,100%_calc(100%-10px),calc(100%-10px)_100%,0_100%,0_10px)]",
          style.pick,
        )}
      >
        {isBlue ? `${t(keys.pick)} →` : `← ${t(keys.pick)}`}
      </span>
    </button>
  );
}

/// The public front door: a split screen asking whether the visitor works on
/// the defensive (blue) or offensive (red) side. The choice is stored and
/// everything after it (track page, sign-in, register) follows it.
export function TrackGate() {
  const { t } = useI18n();

  return (
    <div className="dark relative flex min-h-svh flex-col bg-[#020203] font-mono text-foreground">
      <header className="absolute inset-x-0 top-0 z-30 flex items-center justify-between px-6 py-5">
        <span className="flex items-center gap-2.5 font-sans text-[15px] font-black tracking-[0.2em]">
          <TrackMark size={30} />
          {"SECORA"}
        </span>
        <div className="flex items-center gap-1">
          <LanguageSwitcher />
          <Button variant="outline" size="sm" asChild>
            <Link href="/login">{t("landing.ctaSecondary")}</Link>
          </Button>
        </div>
      </header>

      <div className="pointer-events-none absolute inset-x-0 top-24 z-20 text-center">
        <p className="mb-2.5 text-[11.5px] tracking-[0.3em] text-zinc-500 uppercase">{t("track.gate.kicker")}</p>
        <h2 className="font-sans text-[clamp(22px,3vw,38px)] font-black tracking-tight text-zinc-100 uppercase">
          {t("track.gate.title")}
        </h2>
      </div>

      <div className="group/split flex flex-1 flex-col md:flex-row">
        {TRACKS.map((track) => (
          <Side key={track} track={track} />
        ))}
      </div>

      {/* Center emblem: shield (defense) meets crosshair (offense). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[56%] left-1/2 z-20 hidden w-[min(300px,28vw)] -translate-x-1/2 -translate-y-1/2 md:block"
      >
        <svg viewBox="0 0 400 400" className="size-full overflow-visible">
          <defs>
            <linearGradient id="trk-core-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset=".45" stopColor="#2aa7ff" />
              <stop offset=".55" stopColor="#ff2a3d" />
            </linearGradient>
            <clipPath id="trk-core-left">
              <rect x="0" y="0" width="200" height="400" />
            </clipPath>
            <clipPath id="trk-core-right">
              <rect x="200" y="0" width="200" height="400" />
            </clipPath>
          </defs>
          <g className="trk-spin">
            <circle cx="200" cy="200" r="180" fill="none" stroke="url(#trk-core-grad)" strokeWidth="1.5" strokeDasharray="3 12" />
          </g>
          <g className="trk-spin-rev">
            <circle cx="200" cy="200" r="140" fill="none" stroke="url(#trk-core-grad)" strokeDasharray="46 16" strokeOpacity=".7" />
          </g>
          <g clipPath="url(#trk-core-left)" fill="none" stroke="#2aa7ff" strokeWidth="3">
            <path d="M200 90 L290 125 V205 C290 260 250 295 200 315 C150 295 110 260 110 205 V125 Z" />
          </g>
          <g clipPath="url(#trk-core-right)" fill="none" stroke="#ff2a3d" strokeWidth="3">
            <path d="M200 90 L290 125 V205 C290 260 250 295 200 315 C150 295 110 260 110 205 V125 Z" strokeOpacity=".35" />
            <circle cx="200" cy="200" r="46" />
            <path d="M200 140v34M200 226v34M140 200h34M226 200h34" />
          </g>
          <path d="M200 90V315" stroke="#fff" strokeOpacity=".5" strokeDasharray="2 6" />
          <circle cx="200" cy="200" r="6" fill="#fff" />
        </svg>
        <p className="absolute -bottom-9 left-1/2 -translate-x-1/2 text-[10.5px] tracking-[0.26em] whitespace-nowrap text-zinc-500 uppercase">
          {t("track.gate.core")}
        </p>
      </div>

      <p className="pointer-events-none absolute inset-x-0 bottom-5 z-20 text-center text-[11.5px] tracking-[0.14em] text-zinc-600 uppercase">
        {t("track.gate.footnote")}
      </p>
    </div>
  );
}
