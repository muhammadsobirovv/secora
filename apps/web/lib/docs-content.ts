import type { Locale } from "@pentesthub/shared";
import { DOC_FILES } from "./docs-bundle.generated";

/// The public documentation site (/docs) is built from an explicit
/// ALLOWLIST of user-facing Markdown files under `docs/user/`. Nothing
/// else in the repository's `docs/` folder (ADRs, reviews/audits, release
/// notes, module/migration/mobile guides, operations logs) is published,
/// and a new file added anywhere in `docs/` stays private until someone
/// deliberately adds it to PUBLIC_DOCS below. That is the point of an
/// allowlist: internal material can never leak onto the site by accident.
///
/// The Markdown is bundled at build time by scripts/generate-docs-bundle.mjs
/// (see there for why), so serving a page never touches the filesystem.
///
/// Translations live next to the English source as `<base>.<locale>.md`
/// (e.g. getting-started.uz.md). A page without a translation for the
/// active language falls back to English and the page shows a notice.

export interface DocEntry {
  slug: string;
  /// File name without extension under docs/user (English source).
  base: string;
  /// Catalog keys for the localized title/description on the docs index.
  titleKey: DocMessageKey;
  descriptionKey: DocMessageKey;
}

type DocMessageKey =
  | "docs.item.getting-started.title"
  | "docs.item.getting-started.description"
  | "docs.item.scanning.title"
  | "docs.item.scanning.description"
  | "docs.item.ai-copilot.title"
  | "docs.item.ai-copilot.description"
  | "docs.item.faq.title"
  | "docs.item.faq.description";

function entry(slug: string): DocEntry {
  return {
    slug,
    base: slug,
    titleKey: `docs.item.${slug}.title` as DocMessageKey,
    descriptionKey: `docs.item.${slug}.description` as DocMessageKey,
  };
}

// Order here is the order docs render in on the /docs index page. Only the
// guides a new user actually needs are published; responsible use lives in
// the Acceptable Use Policy and vulnerability disclosure on /security.
// bug-bounty.md, api-sdk-cli.md, responsible-use.md and security.md stay in
// docs/user for later but are not served.
export const PUBLIC_DOCS: readonly DocEntry[] = [
  entry("getting-started"),
  entry("scanning"),
  entry("ai-copilot"),
  entry("faq"),
];

export function listAllDocs(): readonly DocEntry[] {
  return PUBLIC_DOCS;
}

export function getDoc(slug: string): DocEntry | undefined {
  return PUBLIC_DOCS.find((doc) => doc.slug === slug);
}

export interface DocContent {
  content: string;
  /// The language the content is actually written in.
  language: Locale;
  /// True when the requested language had no translation and English is
  /// shown instead.
  isFallback: boolean;
}

export function getDocContent(slug: string, locale: Locale = "en"): DocContent | null {
  const entry = getDoc(slug);
  if (!entry) return null;

  if (locale !== "en") {
    const translated = DOC_FILES[`${entry.base}.${locale}.md`];
    if (translated !== undefined) return { content: translated, language: locale, isFallback: false };
  }
  const english = DOC_FILES[`${entry.base}.md`];
  if (english === undefined) return null;
  return { content: english, language: "en", isFallback: locale !== "en" };
}
