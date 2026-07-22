#!/usr/bin/env node
// Zips `dist/chrome` and `dist/firefox` into store-submission-ready
// archives under `dist/zip/`. Run `npm run build` first.
import archiver from "archiver";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url)) + "/..";
const zipDir = join(ROOT, "dist", "zip");
mkdirSync(zipDir, { recursive: true });

async function zipTarget(target) {
  const srcDir = join(ROOT, "dist", target);
  if (!existsSync(srcDir)) {
    console.warn(`[pentesthub-ai] dist/${target} not found — run "npm run build:${target}" first.`);
    return;
  }
  const outPath = join(zipDir, `pentesthub-ai-${target}.zip`);
  const output = createWriteStream(outPath);
  const archive = archiver("zip", { zlib: { level: 9 } });

  await new Promise((resolve, reject) => {
    output.on("close", resolve);
    archive.on("error", reject);
    archive.pipe(output);
    archive.directory(srcDir, false);
    archive.finalize();
  });

  console.log(`[pentesthub-ai] wrote ${outPath} (${(archive.pointer() / 1024).toFixed(1)} KB)`);
}

await zipTarget("chrome");
await zipTarget("firefox");
