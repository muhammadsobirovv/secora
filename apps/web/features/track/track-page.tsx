"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PublicFooter } from "@/components/public/public-shell";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/features/i18n/language-switcher";
import { useI18n } from "@/features/i18n/i18n-context";
import { usePrefersReducedMotion } from "@/lib/hooks/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";
import { CodeRain } from "./code-rain";
import { TrackConsole } from "./track-console";
import { TRACK_LITERAL, TRACK_SHORT, trackKeys } from "./track-content";
import { TrackIntro } from "./track-intro";
import { TrackMark } from "./track-mark";
import { otherTrack, TRACK_COLOR, TRACKS, writeTrackCookie, type Track } from "./track";
import { useChooseTrack } from "./use-choose-track";

const SCRAMBLE_GLYPHS = "01ABCDEF#$%&/<>[]{}";

/// Resolves `text` out of random glyphs, left to right, once on mount (and
/// again if the text changes, e.g. a language switch). Static for visitors
/// who prefer reduced motion.
function useScramble(text: string): string {
  const reducedMotion = usePrefersReducedMotion();
  const [value, setValue] = React.useState(text);

  React.useEffect(() => {
    if (reducedMotion) {
      setValue(text);
      return;
    }
    let revealed = 0;
    const timer = window.setInterval(() => {
      setValue(
        text
          .split("")
          .map((char, index) =>
            char === " " || index < revealed
              ? char
              : (SCRAMBLE_GLYPHS[Math.floor(Math.random() * SCRAMBLE_GLYPHS.length)] ?? char),
          )
          .join(""),
      );
      revealed += 0.7;
      if (revealed >= text.length) {
        window.clearInterval(timer);
        setValue(text);
      }
    }, 38);
    return () => window.clearInterval(timer);
  }, [text, reducedMotion]);

  return value;
}

const TRACK_BUTTON_ACTIVE: Record<Track, string> = {
  red: "bg-[#ff2a3d] text-[#1a0003]",
  blue: "bg-[#2aa7ff] text-[#001423]",
};

/// Targeting reticle / radar. Colors follow `currentColor` (the track accent);
/// the second marker is always amber so a "warning" reads the same on both.
function Reticle() {
  return (
    <svg viewBox="0 0 400 400" aria-hidden="true" className="size-full overflow-visible text-primary">
      <g fill="none" stroke="currentColor">
        <circle cx="200" cy="200" r="190" strokeOpacity=".25" />
        <circle cx="200" cy="200" r="130" strokeOpacity=".4" />
        <circle cx="200" cy="200" r="70" strokeOpacity=".6" />
        <g className="trk-spin">
          <circle cx="200" cy="200" r="160" strokeDasharray="3 12" strokeWidth="2" />
        </g>
        <g className="trk-spin-rev">
          <circle cx="200" cy="200" r="100" strokeDasharray="40 14" strokeOpacity=".7" />
        </g>
        <path d="M200 0v120M200 280v120M0 200h120M280 200h120" strokeWidth="1.5" />
        <path
          d="M60 60h28M60 60v28M340 60h-28M340 60v28M60 340h28M60 340v-28M340 340h-28M340 340v-28"
          strokeWidth="2.5"
        />
      </g>
      <g className="trk-sweep">
        <path d="M200 200L200 10A190 190 0 0 1 335 65Z" fill="currentColor" opacity=".16" />
      </g>
      <circle cx="262" cy="132" r="4" fill="currentColor" />
      <circle className="trk-ping" cx="262" cy="132" r="3" fill="none" stroke="currentColor" />
      <circle cx="140" cy="268" r="3" fill="#ffb020" />
      <circle className="trk-ping" cx="140" cy="268" r="3" fill="none" stroke="#ffb020" />
      <circle cx="200" cy="200" r="5" fill="currentColor" />
    </svg>
  );
}

function SectionHead({ index, title }: { index: string; title: string }) {
  return (
    <div className="mb-8 flex items-baseline gap-3.5">
      <span className="text-xs tracking-[0.2em] text-primary">{index}</span>
      <h2 className="font-sans text-2xl font-black tracking-wide uppercase">{title}</h2>
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
    </div>
  );
}

/// One track's public page (red = offensive, blue = defensive). Same layout
/// for both; the words come from the catalog (`track.<track>.*`), the colors
/// from the `data-track` theme tokens, and the terminal text from
/// ./track-content. Visiting it also records the track for sign-in/register.
export function TrackPage({ track }: { track: Track }) {
  const { t } = useI18n();
  const router = useRouter();
  const choose = useChooseTrack();
  const keys = trackKeys(track);
  const literal = TRACK_LITERAL[track];
  const glow = useScramble(t(keys.heroGlow));

  React.useEffect(() => {
    writeTrackCookie(track);
  }, [track]);

  const other = otherTrack(track);

  return (
    <div
      data-track={track}
      className="dark relative min-h-svh overflow-x-clip bg-background font-mono text-[14px] text-foreground"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[640px] bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,color-mix(in_oklab,var(--primary)_18%,transparent),transparent_70%)]"
      />
      <TrackIntro track={track} />

      {/* Status strip */}
      <div className="relative flex items-center gap-6 overflow-x-auto border-b border-border bg-black/40 px-6 py-1.5 text-[11.5px] tracking-[0.08em] whitespace-nowrap text-muted-foreground uppercase">
        {literal.status.map((item, index) => (
          <span key={item.value}>
            {index === 0 ? (
              <span aria-hidden="true" className="mr-2 inline-block size-[7px] animate-pulse rounded-full bg-primary shadow-[0_0_8px_var(--primary)]" />
            ) : null}
            {item.label ? `${item.label}: ` : ""}
            <b className={item.tone === "ok" ? "text-sev-ok" : "text-primary"}>{item.value}</b>
          </span>
        ))}
      </div>

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-4 px-6">
          <Link href="/" className="flex items-center gap-2.5 font-sans text-[15px] font-black tracking-[0.2em]">
            <TrackMark track={track} size={30} animate />
            {"SECORA"}
          </Link>
          <nav className="ml-6 hidden items-center gap-6 text-[12.5px] tracking-[0.12em] text-muted-foreground uppercase md:flex">
            <a href="#flow" className="transition-colors hover:text-primary">
              {t("track.nav.flow")}
            </a>
            <a href="#modules" className="transition-colors hover:text-primary">
              {t("track.nav.modules")}
            </a>
            <a href="#console" className="transition-colors hover:text-primary">
              {t("track.nav.console")}
            </a>
            <Link href="/docs" className="transition-colors hover:text-primary">
              {t("nav.documentation")}
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden border border-border sm:flex">
              {TRACKS.map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  aria-pressed={candidate === track}
                  onClick={() => (candidate === track ? undefined : choose(candidate))}
                  className={cn(
                    "px-3 py-2 text-[11px] font-bold tracking-[0.16em] uppercase transition-colors",
                    candidate === track
                      ? TRACK_BUTTON_ACTIVE[candidate]
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {TRACK_SHORT[candidate]}
                </button>
              ))}
            </div>
            <LanguageSwitcher />
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">{t("landing.ctaSecondary")}</Link>
            </Button>
            <Button size="sm" asChild className="hidden sm:inline-flex">
              <Link href="/register">{t("landing.ctaPrimary")}</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="relative">
        {/* Hero */}
        <section className="relative mx-auto grid max-w-[1240px] items-center gap-8 px-6 pt-16 pb-10 lg:grid-cols-[1.15fr_.85fr] lg:pt-20">
          <div className="pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_80%_70%_at_70%_40%,#000,transparent)]">
            <CodeRain color={TRACK_COLOR[track]} className="opacity-30" />
          </div>
          <div>
            <span className="mb-5 inline-block border border-border px-2.5 py-1 text-[11.5px] tracking-[0.2em] text-primary uppercase">
              {t(keys.chip)}
            </span>
            <h1 className="font-sans text-[clamp(32px,5vw,62px)] leading-[1.04] font-black tracking-tight uppercase">
              <span className="block">{t(keys.heroPre)}</span>
              <span className="trk-glitch" data-text={glow}>
                {glow}
              </span>
            </h1>
            <p className="mt-6 mb-7 max-w-xl text-[15px] text-muted-foreground">{t(keys.lead)}</p>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                router.push("/register");
              }}
              className="flex max-w-xl border border-border bg-card transition-colors focus-within:border-primary focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_14%,transparent)]"
            >
              <span className="py-3 pl-3.5 whitespace-nowrap text-primary">{literal.prompt}</span>
              <input
                aria-label={t(keys.scan)}
                placeholder={literal.placeholder}
                autoComplete="off"
                spellCheck={false}
                className="min-w-0 flex-1 bg-transparent px-3 text-[15px] text-foreground outline-none placeholder:text-muted-foreground/60"
              />
              <Button type="submit" className="h-auto rounded-none px-5 font-bold tracking-[0.14em] uppercase">
                {t(keys.scan)}
              </Button>
            </form>
            <p className="mt-3 text-[11.5px] text-muted-foreground/70">{t(keys.fine)}</p>
          </div>

          <div className="relative mx-auto aspect-square w-full max-w-[440px]">
            <Reticle />
            {literal.callouts.map((callout) => (
              <span
                key={callout.text}
                className={cn(
                  "absolute text-[10.5px] tracking-[0.14em] uppercase",
                  callout.position,
                  callout.warn ? "text-[#ffb020]" : "text-primary",
                )}
              >
                {callout.text}
              </span>
            ))}
          </div>
        </section>

        <div
          aria-hidden="true"
          className="my-8 h-3 bg-[repeating-linear-gradient(-45deg,var(--primary)_0_14px,#000_14px_28px)] opacity-80"
        />

        {/* Stages */}
        <section id="flow" className="mx-auto max-w-[1240px] scroll-mt-20 px-6 py-12">
          <SectionHead index="01" title={t(keys.flowTitle)} />
          <div className="grid grid-cols-2 border border-border md:grid-cols-3 lg:grid-cols-6">
            {keys.stages.map(([titleKey, descKey], index) => (
              <div
                key={titleKey}
                className="group border-r border-b border-border bg-card p-5 transition-colors last:border-r-0 hover:bg-primary/10 lg:border-b-0"
              >
                <div className="font-sans text-3xl font-black text-border transition-colors group-hover:text-primary">
                  {`0${index + 1}`}
                </div>
                <h4 className="mt-2 mb-1.5 text-[13px] font-bold tracking-[0.12em] uppercase">{t(titleKey)}</h4>
                <p className="text-[12.5px] text-muted-foreground">{t(descKey)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Modules */}
        <section id="modules" className="mx-auto max-w-[1240px] scroll-mt-20 px-6 py-12">
          <SectionHead index="02" title={t(keys.modsTitle)} />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {keys.mods.map(([titleKey, descKey], index) => (
              <div
                key={titleKey}
                className="relative border border-border bg-card p-5 transition-all before:absolute before:-top-px before:-left-px before:size-3 before:border-t-2 before:border-l-2 before:border-primary after:absolute after:-right-px after:-bottom-px after:size-3 after:border-r-2 after:border-b-2 after:border-primary hover:-translate-y-0.5 hover:border-primary hover:shadow-[0_0_34px_-10px_var(--track-glow)]"
              >
                <small className="text-[10.5px] tracking-[0.18em] text-primary">{`MOD-0${index + 1}`}</small>
                <h3 className="my-2 text-[15px] font-bold tracking-[0.06em] uppercase">{t(titleKey)}</h3>
                <p className="text-[13px] text-muted-foreground">{t(descKey)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Console */}
        <section id="console" className="mx-auto max-w-[1240px] scroll-mt-20 px-6 py-12">
          <SectionHead index="03" title={t("track.console.title")} />
          <TrackConsole track={track} />
        </section>

        {/* Stats */}
        <section className="mx-auto max-w-[1240px] px-6 py-12">
          <div className="grid grid-cols-2 border border-border lg:grid-cols-4">
            {keys.stats.map(([valueKey, labelKey]) => (
              <div key={valueKey} className="border-r border-border p-6 last:border-r-0">
                <b className="block font-sans text-4xl font-black text-primary [text-shadow:0_0_24px_var(--track-glow)]">
                  {t(valueKey)}
                </b>
                <span className="text-[11.5px] tracking-[0.14em] text-muted-foreground uppercase">{t(labelKey)}</span>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-[1240px] px-6 py-12">
          <div className="border border-primary bg-[radial-gradient(ellipse_at_top,color-mix(in_oklab,var(--primary)_16%,transparent),transparent_70%)] px-6 py-14 text-center">
            <h2 className="mb-3 font-sans text-3xl font-black uppercase">{t(keys.ctaTitle)}</h2>
            <p className="mb-7 text-muted-foreground">{t(keys.ctaText)}</p>
            <Button size="lg" asChild className="font-bold tracking-[0.14em] uppercase">
              <Link href="/register">{t(keys.ctaButton)}</Link>
            </Button>
          </div>
        </section>

        {/* Switch track */}
        <section className="mx-auto max-w-[1240px] px-6 pb-16">
          <div className="flex flex-wrap items-center justify-between gap-5 border border-dashed border-border px-6 py-5 text-[13px] text-muted-foreground">
            <span>{t(keys.crossText)}</span>
            <Button variant="outline" onClick={() => choose(other)} className="font-bold tracking-[0.14em] uppercase">
              {t(keys.crossButton)}
            </Button>
          </div>
        </section>
      </main>

      <PublicFooter track={track} />
    </div>
  );
}
