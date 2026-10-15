"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { LEGAL_EFFECTIVE_DATE, LEGAL_VERSION } from "@pentesthub/shared";
import { LanguageSwitcher } from "@/features/i18n/language-switcher";
import { ThemeSwitcher } from "@/components/layout/theme-switcher";
import { useI18n } from "@/features/i18n/i18n-context";
import { cn } from "@/lib/utils";
import { en } from "./content/en";
import { uz } from "./content/uz";
import { ru } from "./content/ru";
import type { LegalCatalog, LegalPageKind } from "./content/types";

const CATALOGS: Record<string, LegalCatalog> = { en, uz, ru };

/// The catalogs carry inline "(LEGAL REVIEW ...)" markers for the lawyer
/// (greppable in content/*.ts). They are drafting notes, never shown to
/// visitors, so they are stripped at render time.
const REVIEW_MARKER = /\s*\(LEGAL REVIEW[^)]*\)/g;
const visible = (text: string): string => text.replace(REVIEW_MARKER, "");

export const LEGAL_LINKS: { kind: LegalPageKind; href: string; labelKey: "legal.nav.terms" | "legal.nav.aup" | "legal.nav.privacy" | "legal.nav.security" }[] = [
  { kind: "terms", href: "/legal/terms", labelKey: "legal.nav.terms" },
  { kind: "aup", href: "/legal/acceptable-use", labelKey: "legal.nav.aup" },
  { kind: "privacy", href: "/legal/privacy", labelKey: "legal.nav.privacy" },
  { kind: "security", href: "/security", labelKey: "legal.nav.security" },
];

/// Renders one legal page in the visitor's language. The "Version …,
/// effective …" line comes from LEGAL_VERSION / LEGAL_EFFECTIVE_DATE in
/// @pentesthub/shared — the same constants the API enforces acceptance
/// against — so the page and the enforced version can never drift apart.
export function LegalDocumentView({ kind }: { kind: LegalPageKind }) {
  const { locale, t } = useI18n();
  const doc = (CATALOGS[locale] ?? en)[kind];
  const versionLine = t("legal.versionLine")
    .replace("{version}", LEGAL_VERSION)
    .replace("{date}", LEGAL_EFFECTIVE_DATE);

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="border-b border-border/70">
        <div className="mx-auto flex h-16 max-w-4xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold whitespace-nowrap">
            <span className="flex size-7 items-center justify-center rounded-md border border-primary/50 bg-primary/15">
              <ShieldCheck className="size-4 text-primary" />
            </span>
            Secora AI
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <LanguageSwitcher />
            <ThemeSwitcher />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-12 sm:px-6">
        <nav aria-label={t("legal.nav.label")} className="mb-8 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {LEGAL_LINKS.map((link) => (
            <Link
              key={link.kind}
              href={link.href}
              aria-current={link.kind === kind ? "page" : undefined}
              className={cn(
                "transition-colors",
                link.kind === kind ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(link.labelKey)}
            </Link>
          ))}
        </nav>

        <h1 className="text-3xl font-semibold tracking-tight">{doc.title}</h1>
        {kind !== "security" && <p className="mt-2 font-mono text-xs text-muted-foreground">{versionLine}</p>}
        <p className="mt-6 text-muted-foreground">{visible(doc.intro)}</p>

        <div className="mt-10 space-y-8">
          {doc.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-lg font-semibold">{section.heading}</h2>
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph} className="mt-3 leading-relaxed text-muted-foreground">
                  {visible(paragraph)}
                </p>
              ))}
              {section.list && (
                <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted-foreground">
                  {section.list.map((item) => (
                    <li key={item}>{visible(item)}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
