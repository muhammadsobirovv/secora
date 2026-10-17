"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Bot, KeyRound, Languages, Play, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/features/i18n/language-switcher";
import { ThemeSwitcher } from "@/components/layout/theme-switcher";
import { useI18n } from "@/features/i18n/i18n-context";
import { PublicFooter, PublicLogo } from "@/components/public/public-shell";
import { BrandReveal } from "@/components/brand-reveal";
import { cn } from "@/lib/utils";
import { HeroTerminal } from "./hero-terminal";

/// In-page sections the header links to; the one on screen lights up.
const SECTIONS = [
  { id: "flow", labelKey: "landing.nav.flow" },
  { id: "ai", labelKey: "landing.nav.ai" },
  { id: "trust", labelKey: "landing.nav.trust" },
] as const;

/// One clear path, first scan to final report.
const FLOW = [
  { titleKey: "landing.flow.s1.title", descKey: "landing.flow.s1.description" },
  { titleKey: "landing.flow.s2.title", descKey: "landing.flow.s2.description" },
  { titleKey: "landing.flow.s3.title", descKey: "landing.flow.s3.description" },
  { titleKey: "landing.flow.s4.title", descKey: "landing.flow.s4.description" },
] as const;

const TRUST = [
  { icon: ShieldCheck, titleKey: "landing.trust.scope.title", descKey: "landing.trust.scope.description" },
  { icon: KeyRound, titleKey: "landing.trust.keys.title", descKey: "landing.trust.keys.description" },
  { icon: Languages, titleKey: "landing.trust.lang.title", descKey: "landing.trust.lang.description" },
  { icon: Bot, titleKey: "landing.trust.byok.title", descKey: "landing.trust.byok.description" },
] as const;

/// Raw scanner output shown on the "noise in" side. Tool output, identical
/// in every language, so it is deliberately not translated.
const SCANNER_NOISE = `[critical] [CVE-2022-22947] [http]
  https://api.example.com:8443/actuator/gateway/routes
  matcher-status: true
[high] [cors-misconfig] [http] https://api.example.com/v1/auth
  access-control-allow-origin: *
[high] [redis-unauth] [tcp] example.com:6379
[info] [tech-detect:spring-boot] [http] https://api.example.com
[medium] [missing-security-headers:x-frame-options]
  https://pay.example.com ...`;

export function LandingPage() {
  const { t } = useI18n();
  const [active, setActive] = React.useState<string | null>(null);

  React.useEffect(() => {
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        // Topmost visible section wins; none visible (intro/hero/CTA) = no highlight.
        setActive(SECTIONS.find((s) => visible.has(s.id))?.id ?? null);
      },
      // Only the band around the middle of the screen counts as "current".
      { rootMargin: "-35% 0px -55% 0px" },
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:gap-4 sm:px-6">
          <PublicLogo />
          <nav className="ml-4 hidden items-center gap-5 text-sm text-muted-foreground md:flex">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                aria-current={active === s.id ? "true" : undefined}
                className={cn(
                  "relative py-1 transition-all duration-300 hover:text-foreground",
                  "after:absolute after:inset-x-0 after:-bottom-0.5 after:h-0.5 after:rounded-full after:bg-primary after:opacity-0 after:shadow-[0_0_10px_var(--primary)] after:transition-opacity after:duration-300",
                  active === s.id && "text-foreground [text-shadow:0_0_14px_var(--primary)] after:opacity-100",
                )}
              >
                {t(s.labelKey)}
              </a>
            ))}
            <Link href="/pricing" className="transition-colors hover:text-foreground">
              {t("nav.pricing")}
            </Link>
            <Link href="/docs" className="transition-colors hover:text-foreground">
              {t("nav.documentation")}
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <LanguageSwitcher />
            <ThemeSwitcher />
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">{t("landing.ctaSecondary")}</Link>
            </Button>
            <Button size="sm" asChild className="hidden sm:inline-flex">
              <Link href="/register">{t("landing.ctaPrimary")}</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Brand intro — fills the first screen (below the 4rem header). */}
        <section className="dark relative flex min-h-[calc(100svh-4rem)] flex-col items-center justify-center overflow-hidden border-b border-border/70 bg-background px-6 text-foreground">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_60%_at_50%_50%,color-mix(in_oklab,var(--primary)_18%,transparent),transparent)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_60%_55%_at_50%_50%,#000,transparent_75%)]"
          />
          <div className="relative scale-[0.3] sm:scale-[0.55] md:scale-[0.7] lg:scale-90 xl:scale-100">
            <BrandReveal size={120} />
          </div>
          <a
            href="#hero"
            aria-hidden="true"
            tabIndex={-1}
            className="absolute bottom-8 flex size-10 animate-bounce items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
          >
            <ArrowRight className="size-4 rotate-90" aria-hidden="true" />
          </a>
        </section>

        {/* Hero — copy left, the product itself right. */}
        <section id="hero" className="relative scroll-mt-16 overflow-hidden border-b border-border/70">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_75%_30%,color-mix(in_oklab,var(--primary)_18%,transparent),transparent)]"
          />
          {/* Faint security-grid texture, fading out away from the hero card. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 opacity-40 [background-image:linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_70%_60%_at_65%_25%,#000,transparent_75%)]"
          />
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-16 md:py-24 lg:grid-cols-[1fr_1.05fr]">
            <div className="flex flex-col items-start gap-6">
              <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 font-mono text-xs text-muted-foreground">
                <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
                {t("landing.badge")}
              </span>
              <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-[3.5rem] lg:leading-[1.05]">
                {t("landing.heroTitle")}
              </h1>
              <p className="max-w-xl text-pretty text-lg leading-relaxed text-foreground/80 sm:text-xl">{t("landing.heroSubtitle")}</p>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Button size="lg" asChild>
                  <Link href="/register">
                    {t("landing.hero.ctaScan")} <ArrowRight />
                  </Link>
                </Button>
                {/* Demo mode is started from the sign-in page (one-click
                    read-only demo workspace) — there's no video. */}
                <Button size="lg" variant="outline" asChild>
                  <Link href="/login">
                    <Play /> {t("landing.hero.ctaDemo")}
                  </Link>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t("landing.trustNote")}</p>
            </div>
            <HeroTerminal />
          </div>
        </section>

        {/* One clear path: scope -> discover -> test -> report */}
        <section id="flow" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-20">
          <div className="mb-10 text-center">
            <p className="font-mono text-xs font-semibold tracking-[0.16em] text-primary uppercase">
              {t("landing.flow.kicker")}
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">{t("landing.flow.title")}</h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">{t("landing.flow.subtitle")}</p>
          </div>
          <ol className="grid grid-cols-1 overflow-hidden rounded-2xl border border-border bg-card sm:grid-cols-2 lg:grid-cols-4">
            {FLOW.map((step, i) => (
              <li
                key={step.titleKey}
                className="border-b border-border p-6 last:border-b-0 sm:border-r sm:even:border-r-0 lg:border-b-0 lg:border-r lg:even:border-r lg:last:border-r-0"
              >
                <span className="font-mono text-xs font-semibold tracking-[0.14em] text-primary tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-2 text-lg font-semibold">{t(step.titleKey)}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{t(step.descKey)}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Scanner noise in, clear answer out */}
        <section id="ai" className="scroll-mt-16 border-y border-border/70 bg-card/40">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="mb-10 text-center">
              <p className="font-mono text-xs font-semibold tracking-[0.16em] text-primary uppercase">
                {t("landing.ai.kicker")}
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">{t("landing.ai.title")}</h2>
              <p className="mx-auto mt-3 max-w-xl text-muted-foreground">{t("landing.ai.subtitle")}</p>
            </div>
            <div className="mx-auto grid max-w-4xl items-stretch gap-4 md:grid-cols-[1fr_auto_1fr]">
              <pre
                aria-hidden="true"
                className="max-h-72 overflow-hidden rounded-2xl border border-border bg-card p-5 font-mono text-[11px] leading-relaxed text-muted-foreground [mask-image:linear-gradient(#000_60%,transparent)]"
              >
                {SCANNER_NOISE}
              </pre>
              <div className="flex items-center justify-center text-2xl text-primary" aria-hidden="true">
                <ArrowRight className="rotate-90 md:rotate-0" />
              </div>
              <div className="rounded-2xl border border-primary/40 bg-gradient-to-b from-primary/10 to-card p-6 shadow-lg shadow-primary/10">
                <span className="font-mono text-xs font-semibold tracking-wider text-sev-critical uppercase">
                  {t("landing.severity.critical")} 9.8
                </span>
                <p className="mt-3 text-[15px] leading-relaxed">{t("landing.ai.answer")}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <span className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground">
                    <Bot className="size-3.5" aria-hidden="true" /> {t("landing.ai.fix")}
                  </span>
                  <span className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium">
                    {t("landing.ai.retest")}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Trust */}
        <section id="trust" className="mx-auto max-w-6xl scroll-mt-16 px-6 py-20">
          <div className="mb-10 text-center">
            <p className="font-mono text-xs font-semibold tracking-[0.16em] text-primary uppercase">
              {t("landing.trust.kicker")}
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">{t("landing.trust.title")}</h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">{t("landing.trust.subtitle")}</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TRUST.map(({ icon: Icon, titleKey, descKey }) => (
              <div
                key={titleKey}
                className="rounded-2xl border border-border bg-card p-5 transition-colors duration-200 hover:border-primary"
              >
                <Icon className="mb-4 size-5 text-primary" aria-hidden="true" />
                <h3 className="font-medium">{t(titleKey)}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{t(descKey)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-border/70">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-6 py-20 md:flex-row md:items-center">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight">{t("landing.cta.title")}</h2>
              <p className="mt-3 max-w-xl text-muted-foreground">{t("landing.cta.subtitle")}</p>
            </div>
            <Button size="lg" asChild>
              <Link href="/register">
                {t("landing.cta.button")} <ArrowRight />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
