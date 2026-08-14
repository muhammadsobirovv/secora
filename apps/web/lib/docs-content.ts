import fs from "node:fs";
import path from "node:path";

/// Module 15 — task #350 "Documentation portal structure".
///
/// Reads Markdown straight out of the monorepo's `docs/` folder (plus a
/// few curated root-level docs — PROJECT_SPEC.md, README.md, SECURITY.md)
/// via Node's built-in `fs`/`path`. Deliberately no new npm dependency
/// (no Docusaurus/Nextra/MkDocs/VitePress) — the app already ships
/// `react-markdown` + `remark-gfm` + `rehype-highlight` for AI chat
/// rendering (`features/ai/components/ai-message-markdown.tsx`), and that
/// same stack is reused here rather than standing up a second rendering
/// pipeline. Adding a real new dependency was also judged extra risk this
/// session given the eslint/pnpm-store corruption incident recorded in
/// task #348/#349's completion notes.
///
/// Every page under `/docs` is statically generated at `next build` time
/// (see `generateStaticParams` + `dynamicParams = false` in
/// `app/docs/[...slug]/page.tsx`), which runs against the full monorepo
/// checkout. Next.js bakes the resulting HTML/RSC payload into the build
/// output, so the deployed `output: "standalone"` runtime (see
/// `next.config.js`) never touches this file system access at request
/// time and does not need `docs/` to be present in the deployed
/// container. If a doc is renamed/removed without a rebuild, visiting its
/// old URL 404s rather than silently reading stale or missing content off
/// disk — the safer failure mode for a "standalone" deployment.
const REPO_ROOT = path.join(process.cwd(), "..", "..");
const DOCS_ROOT = path.join(REPO_ROOT, "docs");

export interface DocCategory {
  slug: string;
  label: string;
  description: string;
}

// Order here is the order categories render in on the /docs index page.
export const DOC_CATEGORIES: DocCategory[] = [
  { slug: "start", label: "Getting Started", description: "Project spec, README, and the security disclosure policy." },
  { slug: "adr", label: "Architecture Decision Records", description: "Why the platform is built the way it is, module by module." },
  { slug: "architecture", label: "Architecture", description: "Cross-cutting system design: API gateway, auto-update, CI/CD, i18n." },
  { slug: "modules", label: "Module Guides", description: "What each numbered module implements." },
  { slug: "security", label: "Security", description: "Secrets management, TLS/mTLS, WAF compatibility, supply chain, permissions." },
  { slug: "compliance", label: "Compliance", description: "GDPR and related regulatory readiness." },
  { slug: "mobile", label: "Mobile", description: "Flutter app architecture and API integration guides." },
  { slug: "migration", label: "Migration Guides", description: "Local-first and desktop-agent migration paths." },
  { slug: "mcp", label: "MCP & Integrations", description: "Model Context Protocol ecosystem guide." },
  { slug: "reviews", label: "Reviews & Audits", description: "Security, performance, accessibility, and production-readiness audits." },
  { slug: "releases", label: "Release Notes", description: "What shipped in each module." },
];

export interface DocEntry {
  category: string;
  slug: string;
  title: string;
  filePath: string;
}

// Curated root-level docs, folded into the "start" category. Paths are
// relative to REPO_ROOT rather than DOCS_ROOT since these files live
// outside docs/.
const ROOT_DOCS: { slug: string; file: string }[] = [
  { slug: "readme", file: "README.md" },
  { slug: "project-spec", file: "PROJECT_SPEC.md" },
  { slug: "security-policy", file: "SECURITY.md" },
];

function extractTitle(markdown: string, fallback: string): string {
  const match = /^#\s+(.+)$/m.exec(markdown);
  return match ? match[1].trim() : fallback;
}

function readCategoryDir(categorySlug: string): DocEntry[] {
  if (categorySlug === "start") {
    return ROOT_DOCS.filter(({ file }) => fs.existsSync(path.join(REPO_ROOT, file))).map(({ slug, file }) => {
      const filePath = path.join(REPO_ROOT, file);
      const raw = fs.readFileSync(filePath, "utf-8");
      return { category: "start", slug, title: extractTitle(raw, file), filePath };
    });
  }

  const dir = path.join(DOCS_ROOT, categorySlug);
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((file) => {
      const filePath = path.join(dir, file);
      const raw = fs.readFileSync(filePath, "utf-8");
      const slug = file.replace(/\.md$/, "");
      return { category: categorySlug, slug, title: extractTitle(raw, slug), filePath };
    });
}

export function listAllDocs(): DocEntry[] {
  return DOC_CATEGORIES.flatMap((c) => readCategoryDir(c.slug));
}

export function getDocsByCategory(categorySlug: string): DocEntry[] {
  return readCategoryDir(categorySlug);
}

export function getCategory(slug: string): DocCategory | undefined {
  return DOC_CATEGORIES.find((c) => c.slug === slug);
}

export function getDocContent(categorySlug: string, slug: string): { title: string; content: string } | null {
  const entry = readCategoryDir(categorySlug).find((e) => e.slug === slug);
  if (!entry) return null;
  return { title: entry.title, content: fs.readFileSync(entry.filePath, "utf-8") };
}
