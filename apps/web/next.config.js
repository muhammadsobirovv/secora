import { createRequire } from "node:module";

// Module 14 — Auto Update: bakes this build's package.json version into
// the client bundle as NEXT_PUBLIC_APP_VERSION. `createRequire` rather
// than a JSON import-assertion — works across the Node versions this
// monorepo's various tooling targets without depending on a specific
// `import ... with { type: "json" }` engine cutoff.
const require = createRequire(import.meta.url);
const { version: appVersion } = require("./package.json");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // @pentesthub/shared ships TypeScript source directly (no build step,
  // see packages/shared/package.json) — Next needs to know to compile it
  // into the bundle rather than treating it as pre-built.
  transpilePackages: ["@pentesthub/shared"],
  // Module 10 — Production Deployment: emits `.next/standalone` (a
  // self-contained server bundle with only the node_modules subset this
  // app actually uses traced in, via Next's build-time dependency
  // tracer) alongside the normal `.next` build output. Additive — `next
  // dev`/`next start` behavior for local development is unaffected;
  // this only changes what `next build` additionally produces. Exists
  // specifically so apps/web/Dockerfile can ship a lean runtime image
  // instead of copying the entire monorepo's node_modules into the
  // final container layer.
  output: "standalone",
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
  },
  // Module 18 — task #523, corrected post-launch by proxy.ts (see its
  // doc comment for the incident this fixes). Content-Security-Policy
  // moved to proxy.ts, which can mint a per-request nonce; a static
  // build-time header here can't, and emitting a second, nonce-less
  // Content-Security-Policy header from this file would AND together
  // with proxy.ts's and re-block everything it allows. The remaining
  // headers below don't need per-request values, so they stay here.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // camera/geolocation: never used anywhere in this app (grepped
          // for navigator.geolocation/getUserMedia and found no call
          // sites) — denied outright. microphone=(self): Module 5 Phase
          // 2's Voice Interaction feature (features/ai/hooks/use-ai-voice.ts)
          // uses the Web Speech API's SpeechRecognition, which still gates
          // on the browser's microphone permission under the hood — so
          // this can't be denied without breaking that feature.
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
          // 180 days, includes subdomains, no preload — same rationale
          // and same values as apps/api's bootstrap.ts helmet() HSTS
          // config (preload is a one-way opt-in to browsers' hardcoded
          // list this app shouldn't make on a deployment's behalf).
          { key: "Strict-Transport-Security", value: "max-age=15552000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
