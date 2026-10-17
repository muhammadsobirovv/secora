import Link from "next/link";
import { ArrowRight, LifeBuoy } from "lucide-react";
import { PublicFooter, PublicHeader } from "@/components/public/public-shell";
import { getServerI18n } from "@/features/i18n/server";
import { listAllDocs } from "@/lib/docs-content";

/// Public index of the user-facing documentation. Lists only the
/// allowlisted docs in `lib/docs-content.ts` — internal engineering
/// material in the repository's `docs/` folder is never published here.
/// Titles and descriptions come from the message catalogs, so the index
/// follows the visitor's language (cookie -> Accept-Language -> "en").
export async function generateMetadata() {
  const { t } = await getServerI18n();
  return { title: t("docs.index.metaTitle"), description: t("docs.index.metaDescription") };
}

export default async function DocsIndexPage() {
  const { t } = await getServerI18n();
  const docs = listAllDocs();

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <PublicHeader active="docs" />

      <main className="relative flex-1 overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_40%_at_70%_0%,color-mix(in_oklab,var(--primary)_16%,transparent),transparent)]"
        />
        <div className="mx-auto max-w-6xl px-6 py-14 md:py-20">
          <p className="font-mono text-xs font-semibold tracking-[0.16em] text-primary uppercase">
            {t("nav.documentation")}
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">{t("docs.index.title")}</h1>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-foreground/80">{t("docs.index.intro")}</p>

          <ul className="mt-12 grid gap-4 sm:grid-cols-2">
            {docs.map((doc, i) => (
              <li key={doc.slug}>
                <Link
                  href={`/docs/${doc.slug}`}
                  className="group flex h-full flex-col rounded-2xl border border-border bg-card p-6 transition-colors hover:border-primary"
                >
                  <span className="font-mono text-xs font-semibold tracking-[0.14em] text-primary tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="mt-2 text-lg font-semibold">{t(doc.titleKey)}</span>
                  <span className="mt-1.5 text-sm text-muted-foreground">{t(doc.descriptionKey)}</span>
                  <ArrowRight
                    className="mt-4 size-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-10 flex flex-col gap-4 rounded-2xl border border-primary/30 bg-primary/10 p-6 sm:flex-row sm:items-center">
            <LifeBuoy className="size-6 shrink-0 text-primary" aria-hidden="true" />
            <div className="flex-1">
              <p className="font-semibold">{t("docs.index.helpTitle")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("docs.index.helpText")}</p>
            </div>
            <a
              href="mailto:support@secora.group"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              {"support@secora.group"}
            </a>
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
