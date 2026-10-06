import Link from "next/link";
import { listAllDocs } from "@/lib/docs-content";
import { DocsLanguageNote } from "./docs-language-note";

/// Public index of the user-facing documentation. Lists only the
/// allowlisted docs in `lib/docs-content.ts` — internal engineering
/// material in the repository's `docs/` folder is never published here.
export const metadata = {
  title: "Documentation — PentestHub AI",
  description:
    "Guides for PentestHub AI: getting started, scanning, bug bounty workflow, AI copilot, responsible use, API and security.",
};

export default function DocsIndexPage() {
  const docs = listAllDocs();

  return (
    <div className="min-h-svh bg-background">
      <div className="mx-auto max-w-4xl px-6 py-16">
        <Link href="/" className="text-sm font-medium text-primary">
          PentestHub AI
        </Link>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Documentation</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Everything you need to test authorized targets with PentestHub AI — from your first target to
          reports, the AI copilot and the API.
        </p>
        <DocsLanguageNote />

        <ul className="mt-10 grid gap-3 sm:grid-cols-2">
          {docs.map((doc) => (
            <li key={doc.slug}>
              <Link
                href={`/docs/${doc.slug}`}
                className="block h-full rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary"
              >
                <span className="font-medium">{doc.title}</span>
                <span className="mt-1 block text-sm text-muted-foreground">{doc.description}</span>
              </Link>
            </li>
          ))}
        </ul>

        <p className="mt-10 text-sm text-muted-foreground">
          Legal: <Link href="/legal/terms" className="text-primary hover:underline">Terms of Service</Link> ·{" "}
          <Link href="/legal/acceptable-use" className="text-primary hover:underline">Acceptable Use</Link> ·{" "}
          <Link href="/legal/privacy" className="text-primary hover:underline">Privacy</Link> ·{" "}
          <Link href="/security" className="text-primary hover:underline">Security</Link>
        </p>
      </div>
    </div>
  );
}
