import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AiMessageMarkdown } from "@/features/ai/components/ai-message-markdown";
import { DOC_CATEGORIES, getCategory, getDocContent, listAllDocs } from "@/lib/docs-content";

/// Module 15 — task #350 "Documentation portal structure".
///
/// Renders one document, e.g. `/docs/adr/0001-auth-module`. Reuses
/// `AiMessageMarkdown` (react-markdown + remark-gfm + rehype-highlight,
/// already shipped for AI chat rendering) rather than a second Markdown
/// pipeline — the docs live inside `<article className="prose">` the
/// same way an AI message does.
///
/// `dynamicParams = false` is the load-bearing line for this page: every
/// valid `/docs/...` URL is enumerated by `generateStaticParams` below
/// and pre-rendered at build time. Any URL that isn't in that list 404s
/// instead of falling through to an on-demand filesystem read — the
/// `output: "standalone"` production build should never need `docs/` to
/// exist at runtime.
export function generateStaticParams() {
  return listAllDocs().map((doc) => ({ slug: [doc.category, doc.slug] }));
}

export const dynamicParams = false;

interface DocPageProps {
  params: Promise<{ slug: string[] }>;
}

function resolveDoc(slugParts: string[]) {
  const [category, docSlug] = slugParts;
  if (!category || !docSlug) return null;
  const doc = getDocContent(category, docSlug);
  if (!doc) return null;
  return { category, docSlug, ...doc };
}

export async function generateMetadata({ params }: DocPageProps) {
  const { slug } = await params;
  const doc = resolveDoc(slug);
  return {
    title: doc ? `${doc.title} — Documentation` : "Documentation — PentestHub AI",
  };
}

export default async function DocPage({ params }: DocPageProps) {
  const { slug } = await params;
  const doc = resolveDoc(slug);
  if (!doc) notFound();

  const categoryMeta = getCategory(doc.category);
  const siblingDocs = DOC_CATEGORIES.find((c) => c.slug === doc.category);

  return (
    <div className="min-h-svh bg-background">
      <div className="mx-auto max-w-4xl px-6 py-16">
        <Link
          href="/docs"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          All documentation
        </Link>

        {categoryMeta && siblingDocs && (
          <p className="mt-6 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {categoryMeta.label}
          </p>
        )}

        <article>
          <AiMessageMarkdown content={doc.content} className="mt-2" />
        </article>
      </div>
    </div>
  );
}
