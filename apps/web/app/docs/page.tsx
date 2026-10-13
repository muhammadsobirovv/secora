import Link from "next/link";
import { getServerI18n } from "@/features/i18n/server";
import { listAllDocs } from "@/lib/docs-content";
import { DocsHeader } from "./docs-header";

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
    <div className="min-h-svh bg-background">
      <DocsHeader />
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight">{t("docs.index.title")}</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">{t("docs.index.intro")}</p>

        <ul className="mt-10 grid gap-3 sm:grid-cols-2">
          {docs.map((doc) => (
            <li key={doc.slug}>
              <Link
                href={`/docs/${doc.slug}`}
                className="block h-full rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary"
              >
                <span className="font-medium">{t(doc.titleKey)}</span>
                <span className="mt-1 block text-sm text-muted-foreground">{t(doc.descriptionKey)}</span>
              </Link>
            </li>
          ))}
        </ul>

        <p className="mt-10 text-sm text-muted-foreground">
          {t("docs.index.legal")}{" "}
          <Link href="/legal/terms" className="text-primary hover:underline">
            {t("legal.nav.terms")}
          </Link>{" "}
          ·{" "}
          <Link href="/legal/acceptable-use" className="text-primary hover:underline">
            {t("landing.footer.aup")}
          </Link>{" "}
          ·{" "}
          <Link href="/legal/privacy" className="text-primary hover:underline">
            {t("landing.footer.privacy")}
          </Link>{" "}
          ·{" "}
          <Link href="/security" className="text-primary hover:underline">
            {t("landing.footer.security")}
          </Link>
        </p>
      </div>
    </div>
  );
}
