import Link from "next/link";
import { DOC_CATEGORIES, getDocsByCategory } from "@/lib/docs-content";

/// Module 15 — task #350 "Documentation portal structure".
///
/// Public index of every document under `docs/` (plus the curated
/// root-level docs) grouped by category. Statically generated — no
/// runtime filesystem dependency (see `lib/docs-content.ts` for why).
export const metadata = {
  title: "Documentation — PentestHub AI",
  description: "Architecture decisions, module guides, security reviews, and release notes for PentestHub AI.",
};

export default function DocsIndexPage() {
  const sections = DOC_CATEGORIES.map((category) => ({
    category,
    docs: getDocsByCategory(category.slug),
  })).filter((section) => section.docs.length > 0);

  return (
    <div className="min-h-svh bg-background">
      <div className="mx-auto max-w-4xl px-6 py-16">
        <p className="text-sm font-medium text-primary">PentestHub AI</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Documentation</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Architecture decisions, module guides, security reviews, and release notes — generated
          directly from the project&apos;s <code className="text-sm">docs/</code> folder.
        </p>

        <div className="mt-12 space-y-10">
          {sections.map(({ category, docs }) => (
            <section key={category.slug}>
              <h2 className="text-lg font-semibold">{category.label}</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">{category.description}</p>
              <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                {docs.map((doc) => (
                  <li key={doc.slug}>
                    <Link
                      href={`/docs/${category.slug}/${doc.slug}`}
                      className="text-sm text-primary underline-offset-4 hover:underline"
                    >
                      {doc.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
