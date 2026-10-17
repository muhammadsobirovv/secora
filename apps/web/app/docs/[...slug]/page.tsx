import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { PublicFooter, PublicHeader } from "@/components/public/public-shell";
import { AiMessageMarkdown } from "@/features/ai/components/ai-message-markdown";
import { getServerI18n } from "@/features/i18n/server";
import { getDoc, getDocContent, listAllDocs } from "@/lib/docs-content";
import { DocToc } from "../doc-toc";
import { DocsNav } from "../docs-nav";

/// Renders one allowlisted user-facing document, e.g. `/docs/getting-started`,
/// in the visitor's language. Reuses `AiMessageMarkdown` (react-markdown +
/// remark-gfm + rehype-highlight, already shipped for AI chat rendering)
/// rather than a second Markdown pipeline.
///
/// `dynamicParams = false` keeps the URL space closed: only slugs returned
/// by `generateStaticParams` (the allowlist) exist, everything else 404s.
/// The content itself comes from the build-time bundle
/// (scripts/generate-docs-bundle.mjs), never from the filesystem.
export function generateStaticParams() {
  return listAllDocs().map((doc) => ({ slug: [doc.slug] }));
}

export const dynamicParams = false;

interface DocPageProps {
  params: Promise<{ slug: string[] }>;
}

function slugOf(slugParts: string[]): string | null {
  // Only single-segment URLs exist; anything deeper (the old
  // /docs/<category>/<doc> paths) is not a public document and 404s.
  return slugParts.length === 1 && slugParts[0] ? slugParts[0] : null;
}

export async function generateMetadata({ params }: DocPageProps) {
  const { slug } = await params;
  const { t } = await getServerI18n();
  const entry = getDoc(slugOf(slug) ?? "");
  return {
    title: entry ? `${t(entry.titleKey)} — ${t("docs.index.title")}` : t("docs.index.metaTitle"),
  };
}

const ARTICLE_ID = "doc-article";

export default async function DocPage({ params }: DocPageProps) {
  const { slug } = await params;
  const { locale, t } = await getServerI18n();
  const slugValue = slugOf(slug);
  const doc = slugValue ? getDocContent(slugValue, locale) : null;
  if (!doc) notFound();

  const docs = listAllDocs();
  const items = docs.map((d) => ({ slug: d.slug, title: t(d.titleKey) }));
  const index = docs.findIndex((d) => d.slug === slugValue);
  const prev = index > 0 ? docs[index - 1] : undefined;
  const next = index >= 0 && index < docs.length - 1 ? docs[index + 1] : undefined;

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <PublicHeader active="docs" />

      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-10 px-6 py-10 lg:grid-cols-[200px_minmax(0,1fr)] xl:grid-cols-[200px_minmax(0,1fr)_200px]">
        <aside className="hidden lg:block">
          <div className="sticky top-24 flex flex-col gap-4">
            <Link
              href="/docs"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              {t("docs.backToAll")}
            </Link>
            <DocsNav items={items} label={t("docs.nav.label")} orientation="vertical" />
          </div>
        </aside>

        <main className="min-w-0">
          <div className="mb-6 lg:hidden">
            <DocsNav items={items} label={t("docs.nav.label")} orientation="horizontal" />
          </div>

          {doc.isFallback && (
            <p
              role="note"
              className="mb-6 rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground"
            >
              {t("docs.notTranslated")}
            </p>
          )}

          <article id={ARTICLE_ID} lang={doc.language}>
            <AiMessageMarkdown
              content={doc.content}
              className="prose-headings:tracking-tight prose-h1:text-3xl prose-h2:mt-10 prose-a:text-primary prose-a:no-underline hover:prose-a:underline"
            />
          </article>

          {(prev || next) && (
            <nav className="mt-12 grid gap-3 border-t border-border pt-6 sm:grid-cols-2">
              {prev ? (
                <Link
                  href={`/docs/${prev.slug}`}
                  className="group rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary"
                >
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <ArrowLeft className="size-3" aria-hidden="true" />
                    {t("docs.prev")}
                  </span>
                  <span className="mt-1 block font-medium">{t(prev.titleKey)}</span>
                </Link>
              ) : (
                <span />
              )}
              {next && (
                <Link
                  href={`/docs/${next.slug}`}
                  className="group rounded-xl border border-border bg-card p-4 text-right transition-colors hover:border-primary sm:col-start-2"
                >
                  <span className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                    {t("docs.next")}
                    <ArrowRight className="size-3" aria-hidden="true" />
                  </span>
                  <span className="mt-1 block font-medium">{t(next.titleKey)}</span>
                </Link>
              )}
            </nav>
          )}
        </main>

        <aside className="hidden xl:block">
          <div className="sticky top-24">
            <DocToc containerId={ARTICLE_ID} label={t("docs.onThisPage")} />
          </div>
        </aside>
      </div>

      <PublicFooter />
    </div>
  );
}
