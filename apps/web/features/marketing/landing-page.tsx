"use client";

import Link from "next/link";
import { ArrowRight, Bot, Bug, Play, Radar, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/features/i18n/language-switcher";
import { ThemeSwitcher } from "@/components/layout/theme-switcher";
import { useI18n } from "@/features/i18n/i18n-context";
import { cn } from "@/lib/utils";
import { HeroTerminal } from "./hero-terminal";
import { AiMock, ReconMock, VulnMock } from "./product-mocks";

const MODULES = [
  { icon: Radar, titleKey: "landing.module.recon", descKey: "landing.feature.recon.description" },
  { icon: ShieldAlert, titleKey: "landing.module.vulns", descKey: "landing.feature.vuln.description" },
  { icon: Bug, titleKey: "landing.module.bounty", descKey: "landing.feature.bugbounty.description" },
  { icon: Bot, titleKey: "landing.module.ai", descKey: "landing.feature.ai.description" },
] as const;

const STEPS = [
  { titleKey: "landing.how.step1.title", descKey: "landing.how.step1.description" },
  { titleKey: "landing.how.step2.title", descKey: "landing.how.step2.description" },
  { titleKey: "landing.how.step3.title", descKey: "landing.how.step3.description" },
] as const;

const ROWS = [
  { eyebrowKey: "landing.module.recon", titleKey: "landing.rows.recon.title", descKey: "landing.rows.recon.description", Mock: ReconMock },
  { eyebrowKey: "landing.module.vulns", titleKey: "landing.rows.vuln.title", descKey: "landing.rows.vuln.description", Mock: VulnMock },
  { eyebrowKey: "landing.module.ai", titleKey: "landing.rows.ai.title", descKey: "landing.rows.ai.description", Mock: AiMock },
] as const;

function Logo() {
  return (
    <span className="flex shrink-0 items-center gap-2 font-semibold whitespace-nowrap">
      <span className="flex size-7 items-center justify-center rounded-md border border-primary/50 bg-primary/15">
        <ShieldCheck className="size-4 text-primary" />
      </span>
      <span>PentestHub AI</span>
    </span>
  );
}

export function LandingPage() {
  const { t } = useI18n();
  const year = new Date().getFullYear();

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:gap-4 sm:px-6">
          <Logo />
          <nav className="ml-6 hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#modules" className="transition-colors hover:text-foreground">
              {t("landing.featuresTitle")}
            </a>
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
        {/* Hero — copy left, the product itself right. */}
        <section className="relative overflow-hidden border-b border-border/70">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_75%_30%,color-mix(in_oklab,var(--primary)_18%,transparent),transparent)]"
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
              <p className="max-w-xl text-pretty text-lg text-muted-foreground">{t("landing.heroSubtitle")}</p>
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

        {/* Modules */}
        <section id="modules" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-20">
          <div className="mb-10 max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight">{t("landing.modules.title")}</h2>
            <p className="mt-3 text-muted-foreground">{t("landing.featuresSubtitle")}</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {MODULES.map(({ icon: Icon, titleKey, descKey }) => (
              <div
                key={titleKey}
                className="rounded-xl border border-border bg-card p-5 transition-colors duration-200 hover:border-primary"
              >
                <Icon className="mb-4 size-5 text-primary" aria-hidden="true" />
                <h3 className="font-medium">{t(titleKey)}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{t(descKey)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="border-y border-border/70 bg-card/60">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <h2 className="mb-12 text-3xl font-semibold tracking-tight">{t("landing.how.title")}</h2>
            <ol className="grid grid-cols-1 gap-10 sm:grid-cols-3">
              {STEPS.map((step, i) => (
                <li key={step.titleKey} className="border-t border-border pt-5">
                  <span className="font-mono text-sm text-primary tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="mt-3 font-medium">{t(step.titleKey)}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{t(step.descKey)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Feature rows */}
        <section className="mx-auto flex max-w-6xl flex-col gap-20 px-6 py-24">
          {ROWS.map(({ eyebrowKey, titleKey, descKey, Mock }, i) => (
            <div key={titleKey} className="grid items-center gap-10 md:grid-cols-2">
              <div className={cn(i % 2 === 1 && "md:order-2")}>
                <p className="font-mono text-xs tracking-wider text-primary uppercase">{t(eyebrowKey)}</p>
                <h3 className="mt-3 text-2xl font-semibold tracking-tight">{t(titleKey)}</h3>
                <p className="mt-3 max-w-md text-muted-foreground">{t(descKey)}</p>
              </div>
              <Mock />
            </div>
          ))}
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

      <footer className="border-t border-border/70">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground sm:flex-row">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Logo />
            <span>
              © {year}. {t("landing.footer.rights")}
            </span>
            <span>
              {t("landing.footer.founder")}{" "}
              <a
                href="https://www.linkedin.com/in/muhammadsobirov"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-foreground"
              >
                Muhammad Sobirov
              </a>
            </span>
          </div>
          <div className="flex items-center gap-5">
            <Link href="/docs" className="transition-colors hover:text-foreground">
              {t("landing.footer.docs")}
            </Link>
            <Link href="/pricing" className="transition-colors hover:text-foreground">
              {t("landing.footer.pricing")}
            </Link>
            <Link href="/docs/start/security-policy" className="transition-colors hover:text-foreground">
              {t("landing.footer.security")}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
