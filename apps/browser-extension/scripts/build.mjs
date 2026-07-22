#!/usr/bin/env node
// Build script — esbuild bundles each entry point individually rather
// than using a heavier framework-specific MV3 plugin (e.g.
// @crxjs/vite-plugin), since this extension's entry points are simple
// and independent (no shared HMR-critical state between them) and a
// direct esbuild invocation is easier to reason about / less likely to
// break across esbuild/vite version bumps than a third-party MV3-aware
// plugin layer. Produces `dist/<target>/` ready to load unpacked in
// `chrome://extensions` (Developer Mode) or `about:debugging` (Firefox).

import { build, context } from "esbuild";
import { mkdirSync, copyFileSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url)) + "/..";
const args = process.argv.slice(2);
const target = (args.find((a) => a.startsWith("--target="))?.split("=")[1]) ?? "chrome";
const watch = args.includes("--watch");
const outDir = join(ROOT, "dist", target);

// Content scripts are NOT declared `"type": "module"` in either
// manifest's `content_scripts` entry (classic script injection is more
// broadly compatible across `run_at` timings), so it must be bundled as
// an IIFE. Every other entry point runs as a real ES module (the
// background service worker/event page declares `"type": "module"`,
// and the HTML pages load their bundle via `<script type="module">`).
const ESM_ENTRY_POINTS = {
  "background/index": "background/index.ts",
  "popup/index": "popup/index.tsx",
  "options/index": "options/index.tsx",
  "sidepanel/index": "sidepanel/index.tsx",
  "devtools/devtools": "devtools/devtools.ts",
  "devtools/panel": "devtools/panel.tsx",
};
const IIFE_ENTRY_POINTS = {
  "content/index": "content/index.ts",
};

const HTML_PAGES = ["popup/index.html", "options/index.html", "sidepanel/index.html", "devtools/devtools.html", "devtools/panel.html"];

function cleanOutDir() {
  if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
}

function copyStaticAssets() {
  for (const page of HTML_PAGES) {
    const src = join(ROOT, page);
    if (!existsSync(src)) continue;
    const dest = join(outDir, page);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
  }

  const iconsSrc = join(ROOT, "public", "icons");
  const iconsDest = join(outDir, "public", "icons");
  mkdirSync(iconsDest, { recursive: true });
  if (existsSync(iconsSrc)) {
    for (const file of ["16.png", "32.png", "48.png", "128.png"]) {
      const src = join(iconsSrc, file);
      if (existsSync(src)) copyFileSync(src, join(iconsDest, file));
    }
  }

  const manifestSrc = join(ROOT, `manifest.${target}.json`);
  const manifest = JSON.parse(readFileSync(manifestSrc, "utf-8"));
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
}

const shared = {
  bundle: true,
  outdir: outDir,
  target: "es2022",
  sourcemap: watch ? "inline" : false,
  minify: !watch,
  define: {
    "process.env.NODE_ENV": watch ? '"development"' : '"production"',
    "__BUILD_TARGET__": JSON.stringify(target),
  },
  loader: { ".png": "copy", ".svg": "text" },
  logLevel: "info",
};

const esmOptions = { ...shared, entryPoints: ESM_ENTRY_POINTS, entryNames: "[dir]/[name]", format: "esm" };
const iifeOptions = { ...shared, entryPoints: IIFE_ENTRY_POINTS, entryNames: "[dir]/[name]", format: "iife" };

async function run() {
  cleanOutDir();
  copyStaticAssets();

  if (watch) {
    const [ctxEsm, ctxIife] = await Promise.all([context(esmOptions), context(iifeOptions)]);
    await Promise.all([ctxEsm.watch(), ctxIife.watch()]);
    console.log(`[pentesthub-ai] watching (${target}) -> ${outDir}`);
  } else {
    await Promise.all([build(esmOptions), build(iifeOptions)]);
    console.log(`[pentesthub-ai] built (${target}) -> ${outDir}`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
