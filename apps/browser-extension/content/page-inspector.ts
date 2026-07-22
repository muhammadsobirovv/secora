// DOM/page-context extraction — runs in the content script's isolated
// world, which has full DOM access (unlike the background service
// worker) but its own JS globals separate from the page's own scripts.
// Everything here reads from `document`/`window` storage APIs directly;
// nothing here needs the "main world" injection some extensions use for
// reading page-defined JS variables, since none of these captures need
// that (Local/Session Storage, forms, and script *sources* are all
// reachable from the isolated world just fine).

export function extractHtml(): string {
  return document.documentElement.outerHTML;
}

/** Inline script bodies + external script `src` URLs (not their bodies —
 * fetching cross-origin script bodies from a content script can trip
 * CSP/CORS in ways that make this unreliable; a list of URLs is what a
 * bug bounty hunter actually wants here, they'll fetch the interesting
 * ones themselves). */
export function extractJavaScript(): string {
  const scripts = Array.from(document.querySelectorAll("script"));
  const inline: string[] = [];
  const external: string[] = [];
  for (const script of scripts) {
    if (script.src) external.push(script.src);
    else if (script.textContent?.trim()) inline.push(script.textContent.trim());
  }
  return JSON.stringify({ externalScriptUrls: external, inlineScriptCount: inline.length, inlineScripts: inline.slice(0, 20) }, null, 2);
}

export interface ExtractedForm {
  action: string;
  method: string;
  id: string | null;
  name: string | null;
  hasFileInput: boolean;
  fields: Array<{ name: string | null; type: string; id: string | null }>;
}

export function extractForms(): string {
  const forms = Array.from(document.forms).map((form): ExtractedForm => ({
    action: form.action || location.href,
    method: (form.method || "GET").toUpperCase(),
    id: form.id || null,
    name: form.name || null,
    hasFileInput: !!form.querySelector('input[type="file"]'),
    fields: Array.from(form.elements)
      .filter((el): el is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement => "name" in el)
      .map((el) => ({ name: el.name || null, type: "type" in el ? (el as HTMLInputElement).type : el.tagName.toLowerCase(), id: el.id || null })),
  }));
  return JSON.stringify(forms, null, 2);
}

// Endpoint discovery is static-analysis-only (regex over HTML + inline
// script text) — no execution/hooking of the page's own fetch/XHR, which
// would require main-world injection and carries a much higher chance of
// interfering with the page. Good enough for surfacing candidate
// endpoints for manual follow-up, not meant to be exhaustive traffic
// capture (that's what "Save Request/Response" + the Burp extension are
// for).
const API_PATH_PATTERN = /(["'`])(\/(?:api|v[0-9]+|graphql|rest|internal)\/[a-zA-Z0-9_\-/{}.]*)\1/g;
const ABSOLUTE_URL_PATTERN = /https?:\/\/[a-zA-Z0-9.-]+(?::[0-9]+)?\/[a-zA-Z0-9_\-/{}.?=&%]*/g;
const GRAPHQL_PATTERN = /(["'`])([^"'`]*graphql[a-zA-Z0-9_\-/]*)\1/gi;
const WEBSOCKET_PATTERN = /wss?:\/\/[a-zA-Z0-9.-]+(?::[0-9]+)?[a-zA-Z0-9_\-/{}.?=&%]*/g;

function corpus(): string {
  const inlineScripts = Array.from(document.querySelectorAll("script:not([src])"))
    .map((s) => s.textContent ?? "")
    .join("\n");
  return document.documentElement.outerHTML + "\n" + inlineScripts;
}

export function extractApiEndpoints(): string {
  const text = corpus();
  const relative = uniqueMatches(text, API_PATH_PATTERN, 2);
  const absolute = uniqueMatches(text, ABSOLUTE_URL_PATTERN, 0).filter((u) => /\/(api|v[0-9]+|rest|internal)\b/.test(u));
  return JSON.stringify({ relative, absolute }, null, 2);
}

export function extractGraphqlEndpoints(): string {
  const text = corpus();
  const found = uniqueMatches(text, GRAPHQL_PATTERN, 2);
  return JSON.stringify(found, null, 2);
}

export function extractWebSocketUrls(): string {
  const text = corpus();
  const found = uniqueMatches(text, WEBSOCKET_PATTERN, 0);
  return JSON.stringify(found, null, 2);
}

function uniqueMatches(text: string, pattern: RegExp, groupIndex: number): string[] {
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  pattern.lastIndex = 0;
  while ((match = pattern.exec(text)) !== null) {
    const value = groupIndex > 0 ? match[groupIndex] : match[0];
    if (value && value.length < 300) found.add(value);
    if (found.size > 200) break; // sane upper bound for a single page
  }
  return Array.from(found);
}

export function extractLocalStorage(): string {
  return safeStorageDump(() => window.localStorage);
}

export function extractSessionStorage(): string {
  return safeStorageDump(() => window.sessionStorage);
}

function safeStorageDump(getStorage: () => Storage): string {
  try {
    const storage = getStorage();
    const entries: Record<string, string> = {};
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key !== null) entries[key] = storage.getItem(key) ?? "";
    }
    return JSON.stringify(entries, null, 2);
  } catch {
    // Storage access can throw in third-party-cookie-blocked / sandboxed
    // iframe contexts — fail soft with an empty object rather than
    // breaking the whole capture.
    return "{}";
  }
}

// Technology Detection — lightweight signature matching against common,
// publicly-known markers (global JS variables, meta generator tags,
// script URL substrings). Not Wappalyzer-scale (hundreds of
// fingerprints), but covers what a pentester scans for first.
const TECH_SIGNATURES: Array<{ name: string; test: () => boolean }> = [
  { name: "React", test: () => !!document.querySelector("[data-reactroot], #__next, #root") || corpus().includes("react-dom") },
  { name: "Vue.js", test: () => !!(window as unknown as { Vue?: unknown }).Vue || corpus().includes("__VUE__") },
  { name: "Angular", test: () => !!document.querySelector("[ng-version]") },
  { name: "jQuery", test: () => !!(window as unknown as { jQuery?: unknown }).jQuery },
  { name: "WordPress", test: () => !!document.querySelector('meta[name="generator"][content*="WordPress" i]') || corpus().includes("wp-content") },
  { name: "Drupal", test: () => !!document.querySelector('meta[name="generator"][content*="Drupal" i]') },
  { name: "Next.js", test: () => !!document.querySelector("#__next") || corpus().includes("_next/static") },
  { name: "Bootstrap", test: () => !!document.querySelector('link[href*="bootstrap"], [class*="col-md-"], [class*="col-lg-"]') },
  { name: "Tailwind CSS", test: () => Array.from(document.querySelectorAll("[class]")).some((el) => /\b(flex|grid|p-\d|m-\d|text-(xs|sm|lg))\b/.test(el.className)) },
  { name: "Cloudflare", test: () => corpus().includes("cloudflare") },
  { name: "Google Analytics", test: () => corpus().includes("google-analytics.com") || corpus().includes("gtag(") },
  { name: "reCAPTCHA", test: () => !!document.querySelector('script[src*="recaptcha"], .g-recaptcha') },
  { name: "GraphQL (Apollo)", test: () => !!(window as unknown as { __APOLLO_CLIENT__?: unknown }).__APOLLO_CLIENT__ },
];

export function detectTechnology(): string {
  const detected = TECH_SIGNATURES.filter((sig) => {
    try {
      return sig.test();
    } catch {
      return false;
    }
  }).map((sig) => sig.name);

  const server = (document as unknown as { characterSet?: string }).characterSet; // placeholder, real server header comes from network-capture on the background side
  void server;
  return JSON.stringify({ detected }, null, 2);
}

// Interesting Parameters — URL query params + form field names that
// commonly indicate testable functionality (IDs, redirects, debug
// flags, file paths) worth a devtools panel calling out explicitly.
const INTERESTING_PARAM_NAMES = /^(id|user(_?id)?|redirect|return(_?url)?|next|url|file|path|debug|test|admin|token|callback|cmd|exec|include|template|lang|locale|page|sort|order|filter|q|query|search)$/i;

export function extractInterestingParameters(): string {
  const found = new Set<string>();
  try {
    const url = new URL(location.href);
    for (const key of url.searchParams.keys()) {
      if (INTERESTING_PARAM_NAMES.test(key)) found.add(`query:${key}`);
    }
  } catch {
    /* ignore */
  }
  for (const input of Array.from(document.querySelectorAll("input[name], select[name], textarea[name]"))) {
    const name = (input as HTMLInputElement).name;
    if (name && INTERESTING_PARAM_NAMES.test(name)) found.add(`form:${name}`);
  }
  return JSON.stringify(Array.from(found), null, 2);
}

/** IndexedDB *metadata* only (database + object store names), per the
 * spec's "IndexedDB (metadata only)" — never dumps record contents. */
export async function extractIndexedDbMetadata(): Promise<string> {
  const idb = window.indexedDB as IDBFactory & { databases?: () => Promise<Array<{ name?: string; version?: number }>> };
  if (!idb.databases) return JSON.stringify({ supported: false });
  try {
    const databases = await idb.databases();
    return JSON.stringify({ supported: true, databases: databases.map((d) => ({ name: d.name, version: d.version })) }, null, 2);
  } catch {
    return JSON.stringify({ supported: true, databases: [], error: "enumeration failed" });
  }
}
