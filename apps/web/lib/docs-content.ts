import fs from "node:fs";
import path from "node:path";

/// The public documentation site (/docs) is built from an explicit
/// ALLOWLIST of user-facing Markdown files under `docs/user/`. Nothing
/// else in the repository's `docs/` folder (ADRs, reviews/audits, release
/// notes, module/migration/mobile guides, operations logs) is published,
/// and a new file added anywhere in `docs/` stays private until someone
/// deliberately adds it to PUBLIC_DOCS below. That is the point of an
/// allowlist: internal material can never leak onto the site by accident.
///
/// Every page is statically generated at `next build` time (see
/// `generateStaticParams` + `dynamicParams = false` in
/// `app/docs/[...slug]/page.tsx`), so the `output: "standalone"` runtime
/// never reads these files at request time and any URL not listed here
/// returns 404.
const REPO_ROOT = path.join(process.cwd(), "..", "..");

export interface DocEntry {
  slug: string;
  title: string;
  description: string;
  /// Path relative to the repository root.
  file: string;
}

// Order here is the order docs render in on the /docs index page.
export const PUBLIC_DOCS: readonly DocEntry[] = [
  {
    slug: "getting-started",
    title: "Getting Started",
    description: "What PentestHub AI is, creating an account, your first workspace and target.",
    file: "docs/user/getting-started.md",
  },
  {
    slug: "scanning",
    title: "Scanning Guide",
    description: "Recon and vulnerability scans, reading findings, severity and exporting.",
    file: "docs/user/scanning.md",
  },
  {
    slug: "bug-bounty",
    title: "Bug Bounty Workflow",
    description: "Import a program and its scope, track findings and build a report.",
    file: "docs/user/bug-bounty.md",
  },
  {
    slug: "ai-copilot",
    title: "AI Copilot",
    description: "What the copilot can and can't do, bring-your-own-key and privacy modes.",
    file: "docs/user/ai-copilot.md",
  },
  {
    slug: "responsible-use",
    title: "Rules of Engagement & Responsible Use",
    description: "A practical guide to testing only what you are authorized to test.",
    file: "docs/user/responsible-use.md",
  },
  {
    slug: "api-sdk-cli",
    title: "API, SDK & CLI",
    description: "Quick reference for the REST API, SDKs, CLI and webhooks.",
    file: "docs/user/api-sdk-cli.md",
  },
  {
    slug: "security",
    title: "Security & Vulnerability Disclosure",
    description: "How to report a vulnerability in PentestHub AI.",
    file: "docs/user/security.md",
  },
  {
    slug: "faq",
    title: "FAQ & Troubleshooting",
    description: "Answers to common account, scanning and AI questions.",
    file: "docs/user/faq.md",
  },
];

export function listAllDocs(): readonly DocEntry[] {
  return PUBLIC_DOCS;
}

export function getDoc(slug: string): DocEntry | undefined {
  return PUBLIC_DOCS.find((doc) => doc.slug === slug);
}

export function getDocContent(slug: string): { title: string; content: string } | null {
  const entry = getDoc(slug);
  if (!entry) return null;
  return { title: entry.title, content: fs.readFileSync(path.join(REPO_ROOT, entry.file), "utf-8") };
}
