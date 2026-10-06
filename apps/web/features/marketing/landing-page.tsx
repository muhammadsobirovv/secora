"use client";

import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Bug,
  FileBarChart,
  Radar,
  ShieldAlert,
  ShieldCheck,
  Siren,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LanguageSwitcher } from "@/features/i18n/language-switcher";
import { ThemeSwitcher } from "@/components/layout/theme-switcher";
import { useI18n } from "@/features/i18n/i18n-context";

const FEATURES = [
  { icon: Radar, titleKey: "landing.feature.recon.title", descKey: "landing.feature.recon.description" },
  { icon: ShieldAlert, titleKey: "landing.feature.vuln.title", descKey: "landing.feature.vuln.description" },
  { icon: Bug, titleKey: "landing.feature.bugbounty.title", descKey: "landing.feature.bugbounty.description" },
  { icon: Bot, titleKey: "landing.feature.ai.title", descKey: "landing.feature.ai.description" },
  { icon: Siren, titleKey: "landing.feature.soc.title", descKey: "landing.feature.soc.description" },
  { icon: FileBarChart, titleKey: "landing.feature.reports.title", descKey: "landing.feature.reports.description" },
] as const;

const STEPS = [
  { titleKey: "landing.how.step1.title", descKey: "landing.how.step1.description" },
  { titleKey: "landing.how.step2.title", descKey: "landing.how.step2.description" },
  { titleKey: "landing.how.step3.title", descKey: "landing.how.step3.description" },
] as const;

export function LandingPage() {
  const { t } = useI18n();
  const year = new Date().getFullYear();

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-6">
          <div className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="size-5 text-primary" />
            <span>PentestHub AI</span>
          </div>
          <nav className="ml-6 hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#features" className="transition-colors hover:text-foreground">
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
            <Button size="sm" asChild>
              <Link href="/register">{t("landing.ctaPrimary")}</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-border/60">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-primary/10 via-primary/0 to-transparent"
          />
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-6 py-24 text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <ShieldCheck className="size-3.5 text-primary" />
              {t("landing.badge")}
            </span>
            <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
              {t("landing.heroTitle")}
            </h1>
            <p className="text-balance max-w-2xl text-lg text-muted-foreground">{t("landing.heroSubtitle")}</p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Button size="lg" asChild>
                <Link href="/register">
                  {t("landing.ctaPrimary")} <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/login">{t("landing.ctaSecondary")}</Link>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t("landing.trustNote")}</p>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-6xl px-6 py-20">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight">{t("landing.featuresTitle")}</h2>
            <p className="mt-3 text-muted-foreground">{t("landing.featuresSubtitle")}</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, titleKey, descKey }) => (
              <Card key={titleKey} className="border-border/60">
                <CardHeader>
                  <div className="mb-2 flex size-9 items-center justify-center rounded-md bg-primary/10">
                    <Icon className="size-5 text-primary" />
                  </div>
                  <CardTitle className="text-base">{t(titleKey)}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{t(descKey)}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="border-y border-border/60 bg-card/40">
          <div className="mx-auto max-w-5xl px-6 py-20">
            <h2 className="mb-12 text-center text-3xl font-semibold tracking-tight">{t("landing.how.title")}</h2>
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
              {STEPS.map((step, i) => (
                <div key={step.titleKey} className="flex flex-col items-center gap-3 text-center">
                  <div className="flex size-10 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-sm font-semibold text-primary">
                    {i + 1}
                  </div>
                  <h3 className="font-medium">{t(step.titleKey)}</h3>
                  <p className="text-sm text-muted-foreground">{t(step.descKey)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-4xl px-6 py-20 text-center">
          <h2 className="text-3xl font-semibold tracking-tight">{t("landing.cta.title")}</h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">{t("landing.cta.subtitle")}</p>
          <div className="mt-8">
            <Button size="lg" asChild>
              <Link href="/register">
                {t("landing.cta.button")} <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4" />
            <span>PentestHub AI</span>
            <span>
              © {year}. {t("landing.footer.rights")}
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
