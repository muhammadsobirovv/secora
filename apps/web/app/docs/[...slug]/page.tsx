import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AiMessageMarkdown } from "@/features/ai/components/ai-message-markdown";
import { getServerI18n } from "@/features/i18n/server";
import { getDoc, getDocContent, listAllDocs } from "@/lib/docs-content";
import { DocsHeader } from "../docs-header";

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

export default async function DocPage({ params }: DocPageProps) {
  const { slug } = await params;
  const { locale, t } = await getServerI18n();
  const slugValue = slugOf(slug);
  const doc = slugValue ? getDocContent(slugValue, locale) : null;
  if (!doc) notFound();

  return (
    <div className="min-h-svh bg-background">
      <DocsHeader />
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <Link
          href="/docs"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          {t("docs.backToAll")}
        </Link>

        {doc.isFallback && (
          <p
            role="note"
            className="mt-6 rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground"
          >
            {t("docs.notTranslated")}
          </p>
        )}

        <article lang={doc.language}>
          <AiMessageMarkdown content={doc.content} className="mt-2" />
        </article>
      </div>
    </div>
  );
}
