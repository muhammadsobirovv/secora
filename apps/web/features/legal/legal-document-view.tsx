"use client";

import Link from "next/link";
import { Mail, ShieldCheck } from "lucide-react";
import { LEGAL_EFFECTIVE_DATE, LEGAL_VERSION } from "@pentesthub/shared";
import { PublicFooter, PublicHeader } from "@/components/public/public-shell";
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
      <PublicHeader active={kind === "security" ? "security" : undefined} />

      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-10 px-6 py-12 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <nav aria-label={t("legal.nav.label")}>
            <ul className="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
              {LEGAL_LINKS.map((link) => (
                <li key={link.kind}>
                  <Link
                    href={link.href}
                    aria-current={link.kind === kind ? "page" : undefined}
                    className={cn(
                      "block rounded-full border px-3 py-1 text-sm transition-colors lg:rounded-md lg:border-0 lg:border-l-2 lg:py-1.5",
                      link.kind === kind
                        ? "border-primary bg-primary/10 font-medium text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground lg:border-transparent",
                    )}
                  >
                    {t(link.labelKey)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label={t("docs.onThisPage")} className="mt-8 hidden lg:block">
            <p className="mb-3 font-mono text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              {t("docs.onThisPage")}
            </p>
            <ul className="flex flex-col gap-1.5 border-l border-border">
              {doc.sections.map((section, i) => (
                <li key={section.heading}>
                  <a
                    href={`#section-${i + 1}`}
                    className="-ml-px block border-l-2 border-transparent py-0.5 pl-3 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                  >
                    {section.heading}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <article className="min-w-0 max-w-3xl">
          <h1 className="text-4xl font-semibold tracking-tight">{doc.title}</h1>
          {kind !== "security" && <p className="mt-3 font-mono text-xs text-muted-foreground">{versionLine}</p>}
          <p className="mt-6 text-lg leading-relaxed text-foreground/80">{visible(doc.intro)}</p>

          {kind === "security" && (
            <div className="mt-8 flex flex-col gap-4 rounded-2xl border border-primary/30 bg-primary/10 p-6 sm:flex-row sm:items-center">
              <ShieldCheck className="size-6 shrink-0 text-primary" aria-hidden="true" />
              <div className="flex-1">
                <p className="font-semibold">{t("legal.security.cardTitle")}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t("legal.security.cardText")}</p>
              </div>
              <a
                href="mailto:security@secora.group"
                className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                <Mail className="size-4" aria-hidden="true" />
                {"security@secora.group"}
              </a>
            </div>
          )}

          <div className="mt-12 space-y-10">
            {doc.sections.map((section, i) => (
              <section key={section.heading} id={`section-${i + 1}`} className="scroll-mt-24">
                <h2 className="flex items-baseline gap-3 text-xl font-semibold tracking-tight">
                  <span className="font-mono text-xs font-semibold text-primary tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {section.heading}
                </h2>
                {section.paragraphs?.map((paragraph) => (
                  <p key={paragraph} className="mt-3 leading-relaxed text-muted-foreground">
                    {visible(paragraph)}
                  </p>
                ))}
                {section.list && (
                  <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted-foreground marker:text-primary">
                    {section.list.map((item) => (
                      <li key={item}>{visible(item)}</li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </article>
      </main>

      <PublicFooter />
    </div>
  );
}
