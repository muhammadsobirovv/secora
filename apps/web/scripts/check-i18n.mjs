import process from "node:process";
// i18n regression guard, run by `pnpm lint` (and so by CI).
//
// 1. Catalog parity: en/uz/ru have IDENTICAL key sets, no empty values, and
//    each key uses the same {placeholders} in every language.
// 2. Every literal `t("...")` key used in code exists in the catalog.
// 3. No NEW hardcoded user-visible strings: JSX text, text-like attributes
//    (placeholder, aria-label, title, alt) and toast.*("literal") calls in
//    app/, features/ and components/ are counted per file with the
//    TypeScript parser and compared with scripts/i18n-baseline.json. A file
//    may only go DOWN; a file not in the baseline must have zero.
//    `node scripts/check-i18n.mjs --update` rewrites the baseline (run it
//    after converting strings, so the ratchet tightens).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const messagesDir = path.join(root, "features", "i18n", "messages");
const baselineFile = path.join(here, "i18n-baseline.json");
const SCAN_DIRS = ["app", "features", "components"];
// Different mechanism: localized per-language TS/MD catalogs of their own.
const SKIP = [/^features\/i18n\//, /^features\/legal\/content\//, /\.generated\./, /\.d\.ts$/];
// Text-like attributes whose literal value is shown to the user.
const TEXT_ATTRS = new Set(["placeholder", "aria-label", "aria-description", "title", "alt"]);
const TOAST_METHODS = new Set(["success", "error", "warning", "info", "message", "loading"]);
// Proper nouns / technical tokens that are not translated.
const NEVER_TRANSLATED = /^(PentestHub AI|GitHub|Google|OpenAI|Anthropic|Gemini|Ollama|OpenRouter|HackerOne|Bugcrowd|Intigriti|YesWeHack|Synack|Stripe|Nuclei|ffuf|Nmap|Naabu|httpx|Katana|Amass|Subfinder|MITRE ATT&CK|OWASP|CVSS|CVE|CWE|CAPEC|SOC|API|CLI|SDK|MCP|SSH|DNS|URL|IP|JSON|CSV|PDF|MFA|TOTP|OAuth|SSE)$/;

const update = process.argv.includes("--update");
const errors = [];

// ---- 1. catalog parity ----------------------------------------------------
const catalogs = {};
for (const locale of ["en", "uz", "ru"]) {
  catalogs[locale] = JSON.parse(fs.readFileSync(path.join(messagesDir, `${locale}.json`), "utf8"));
}
const enKeys = new Set(Object.keys(catalogs.en));
const placeholdersOf = (s) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort().join(",");
for (const locale of ["uz", "ru"]) {
  const keys = new Set(Object.keys(catalogs[locale]));
  const missing = [...enKeys].filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !enKeys.has(k));
  if (missing.length) errors.push(`${locale}.json is missing ${missing.length} key(s): ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? " …" : ""}`);
  if (extra.length) errors.push(`${locale}.json has ${extra.length} key(s) not in en.json: ${extra.slice(0, 8).join(", ")}${extra.length > 8 ? " …" : ""}`);
}
// Plural groups (features/i18n/plural.ts): every "<base>_<form>" key belongs
// to a group that must have an "_other" form in every locale.
const PLURAL_SUFFIX = /_(one|few|many|other)$/;
for (const locale of ["en", "uz", "ru"]) {
  for (const key of Object.keys(catalogs[locale])) {
    if (!PLURAL_SUFFIX.test(key)) continue;
    const base = key.replace(PLURAL_SUFFIX, "");
    if (!(`${base}_other` in catalogs[locale])) errors.push(`${locale}.json: plural group "${base}" has no _other form`);
  }
}
for (const locale of ["en", "uz", "ru"]) {
  for (const [key, value] of Object.entries(catalogs[locale])) {
    if (typeof value !== "string" || value.trim() === "") errors.push(`${locale}.json: "${key}" is empty`);
    else if (enKeys.has(key) && placeholdersOf(value) !== placeholdersOf(catalogs.en[key])) {
      errors.push(`${locale}.json: "${key}" placeholders {${placeholdersOf(value)}} differ from en {${placeholdersOf(catalogs.en[key])}}`);
    }
  }
}

// ---- 2/3. scan source -----------------------------------------------------
function walk(dir) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((entry) => {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return entry.name === "node_modules" || entry.name === ".next" ? [] : walk(rel);
    return /\.(tsx?)$/.test(entry.name) ? [rel] : [];
  });
}

const hasLetters = (s) => /[\p{L}]{2,}/u.test(s);
const isLiteralWorthTranslating = (s) => {
  const text = s.replace(/&[a-z]+;|&#\d+;/gi, " ").trim();
  return hasLetters(text) && !NEVER_TRANSLATED.test(text) && !/^[A-Z0-9 _.\-/+&:()]+$/.test(text);
};

const found = {};
const unknownKeys = [];
for (const rel of SCAN_DIRS.flatMap(walk)) {
  if (SKIP.some((re) => re.test(rel))) continue;
  const source = fs.readFileSync(path.join(root, rel), "utf8");
  const sf = ts.createSourceFile(rel, source, ts.ScriptTarget.Latest, true, rel.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const hits = [];
  const lineOf = (node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

  (function visit(node) {
    if (ts.isJsxText(node)) {
      const text = node.getText(sf).replace(/\s+/g, " ").trim();
      if (text && isLiteralWorthTranslating(text)) hits.push({ line: lineOf(node), text });
    } else if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
      if (TEXT_ATTRS.has(node.name.getText(sf)) && isLiteralWorthTranslating(node.initializer.text)) {
        hits.push({ line: lineOf(node), text: `${node.name.getText(sf)}="${node.initializer.text}"` });
      }
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isPropertyAccessExpression(callee) && callee.expression.getText(sf) === "toast" && TOAST_METHODS.has(callee.name.text)) {
        const [arg] = node.arguments;
        if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg) || ts.isTemplateExpression(arg))) {
          const text = ts.isTemplateExpression(arg) ? arg.getText(sf) : arg.text;
          if (isLiteralWorthTranslating(text)) hits.push({ line: lineOf(node), text: `toast.${callee.name.text}(${text})` });
        }
      }
      if (ts.isIdentifier(callee) && callee.text === "t") {
        const [arg] = node.arguments;
        if (arg && ts.isStringLiteral(arg) && !enKeys.has(arg.text)) unknownKeys.push(`${rel}:${lineOf(node)} t("${arg.text}")`);
      }
      // plural("base", count) — the base must be a plural group in en (its _other form).
      if (ts.isIdentifier(callee) && callee.text === "plural") {
        const [arg] = node.arguments;
        if (arg && ts.isStringLiteral(arg) && !enKeys.has(`${arg.text}_other`)) unknownKeys.push(`${rel}:${lineOf(node)} plural("${arg.text}") has no ${arg.text}_other`);
      }
    }
    ts.forEachChild(node, visit);
  })(sf);

  if (hits.length) found[rel] = hits;
}

for (const u of unknownKeys) errors.push(`unknown message key: ${u}`);

// ---- baseline ratchet -----------------------------------------------------
const counts = Object.fromEntries(Object.entries(found).map(([f, h]) => [f, h.length]).sort(([a], [b]) => a.localeCompare(b)));
if (update) {
  fs.writeFileSync(baselineFile, JSON.stringify(counts, null, 2) + "\n");
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`i18n baseline updated: ${total} hardcoded string(s) in ${Object.keys(counts).length} file(s).`);
} else {
  const baseline = fs.existsSync(baselineFile) ? JSON.parse(fs.readFileSync(baselineFile, "utf8")) : {};
  for (const [file, hits] of Object.entries(found)) {
    const allowed = baseline[file] ?? 0;
    if (hits.length > allowed) {
      errors.push(
        `${file}: ${hits.length} hardcoded UI string(s), baseline allows ${allowed}. Use t() keys instead:\n` +
          hits.slice(0, 6).map((h) => `      line ${h.line}: ${h.text.slice(0, 90)}`).join("\n"),
      );
    }
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const baselineTotal = Object.values(baseline).reduce((a, b) => a + b, 0);
  console.log(`i18n: ${enKeys.size} keys x 3 languages in sync; hardcoded UI strings ${total} (baseline ${baselineTotal}).`);
  if (total < baselineTotal) console.log("i18n: fewer hardcoded strings than the baseline — run `pnpm --filter web check:i18n -- --update` to lock in the gain.");
}

if (errors.length) {
  console.error("\ni18n check failed:\n" + errors.map((e) => `  - ${e}`).join("\n"));
  process.exit(1);
}
