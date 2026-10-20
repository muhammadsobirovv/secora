"use client";

import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { TrackMark } from "@/features/track/track-mark";
import type { Track } from "@/features/track/track";
import { Button } from "@/components/ui/button";
import { ThemeSwitcher } from "@/components/layout/theme-switcher";
import { LanguageSwitcher } from "@/features/i18n/language-switcher";
import { useI18n } from "@/features/i18n/i18n-context";
import { cn } from "@/lib/utils";

export function PublicLogo({ track }: { track?: Track | null }) {
  return (
    <span className="flex shrink-0 items-center gap-2 font-semibold whitespace-nowrap">
      {/* On a track page the mark follows the track (red recolors it). */}
      {track ? <TrackMark track={track} size={28} /> : <BrandMark size={28} />}
      <span>{"Secora AI"}</span>
    </span>
  );
}

type PublicSection = "docs" | "security";

/// Header shared by the public pages (docs, security, legal): same brand,
/// language/theme switchers and sign-in buttons as the landing page, with the
/// current section highlighted.
export function PublicHeader({ active }: { active?: PublicSection }) {
  const { t } = useI18n();
  const links = [
    { id: "docs", href: "/docs", label: t("nav.documentation") },
    { id: "security", href: "/security", label: t("landing.footer.security") },
  ] as const;

  return (
    <header className="sticky top-0 z-20 border-b border-border/70 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:gap-4 sm:px-6">
        <Link href="/">
          <PublicLogo />
        </Link>
        <nav className="ml-4 flex items-center gap-5 text-sm text-muted-foreground">
          {links.map((link) => (
            <Link
              key={link.id}
              href={link.href}
              aria-current={active === link.id ? "page" : undefined}
              className={cn(
                "relative py-1 transition-colors hover:text-foreground",
                "after:absolute after:inset-x-0 after:-bottom-0.5 after:h-0.5 after:rounded-full after:bg-primary after:opacity-0 after:shadow-[0_0_10px_var(--primary)] after:transition-opacity",
                active === link.id && "text-foreground after:opacity-100",
              )}
            >
              {link.label}
            </Link>
          ))}
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
  );
}

/// Footer shared by the landing page and every public page.
export function PublicFooter({ track }: { track?: Track | null }) {
  const { t } = useI18n();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border/70">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground sm:flex-row">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <PublicLogo track={track} />
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
              {"Muhammad Sobirov"}
            </a>
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <Link href="/docs" className="transition-colors hover:text-foreground">
            {t("landing.footer.docs")}
          </Link>
          <Link href="/pricing" className="transition-colors hover:text-foreground">
            {t("landing.footer.pricing")}
          </Link>
          <Link href="/security" className="transition-colors hover:text-foreground">
            {t("landing.footer.security")}
          </Link>
          <Link href="/legal/terms" className="transition-colors hover:text-foreground">
            {t("landing.footer.terms")}
          </Link>
          <Link href="/legal/privacy" className="transition-colors hover:text-foreground">
            {t("landing.footer.privacy")}
          </Link>
          <a href="mailto:support@secora.group" className="transition-colors hover:text-foreground">
            {t("landing.footer.support")}
          </a>
        </div>
      </div>
    </footer>
  );
}
