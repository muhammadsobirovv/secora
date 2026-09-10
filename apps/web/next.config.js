import { createRequire } from "node:module";

// Module 14 — Auto Update: bakes this build's package.json version into
// the client bundle as NEXT_PUBLIC_APP_VERSION. `createRequire` rather
// than a JSON import-assertion — works across the Node versions this
// monorepo's various tooling targets without depending on a specific
// `import ... with { type: "json" }` engine cutoff.
const require = createRequire(import.meta.url);
const { version: appVersion } = require("./package.json");

// Module 18 — task #523, corrected post-launch. The original CSP here
// shipped `script-src 'self'` with no `'unsafe-inline'`/nonce, on the
// (wrong, in production) assumption that the App Router's hydration
// payload is inert JSON and that this codebase has no inline <script>
// usage. Next 16's Turbopack/RSC runtime injects genuine executable
// <script> tags of its own (the `self.__next_f.push(...)` streaming
// chunks) regardless of anything this app's own code does, and a
// strict `script-src 'self'` blocks those — confirmed in production via
// browser console ("Executing inline script violates ... script-src
// 'self'" on every page, rendering the whole app blank).
//
// A nonce-based CSP (proxy.ts minting a fresh nonce per request) was
// tried first, since it's the stricter option, but Next's own docs are
// explicit that per-request nonces only work on *dynamically rendered*
// pages (https://nextjs.org/docs/app/guides/content-security-policy,
// "How nonces work in Next.js" / "Static vs Dynamic Rendering with
// CSP") — this app's pages are statically prerendered at build time (no
// per-page `connection()`/dynamic opt-in anywhere), so their <script>
// tags are baked in before any request (and any nonce) exists, and can
// never match a nonce minted later at request time. Forcing every page
// in the app to dynamic rendering just to support nonces (killing
// static optimization/CDN caching app-wide) is a much larger,
// higher-risk change than this incident warrants. Next's own docs
// cover exactly this case ("Without Nonces") and recommend precisely
// this `'unsafe-inline'` fallback — same trade-off this file already
// made for `style-src` below, for the same reason (inline style
// injection is a far weaker primitive than inline script injection).
const apiUrl = new URL(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000");
const apiOrigin = apiUrl.origin;
const apiWsOrigin = `${apiUrl.protocol === "https:" ? "wss:" : "ws:"}//${apiUrl.host}`;

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
  async headers() {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      // `https:` (not just 'self' data: blob:): workspace/user
      // avatarUrl (apps/api/src/modules/workspaces/commands/upload-
      // workspace-avatar.command.ts) is whatever URL StorageService.upload()
      // returns — for an S3/R2/MinIO-backed deployment that's a storage
      // endpoint domain set via a server-only env var, not something this
      // build-time config can know or pin to a fixed origin. Restricting
      // img-src to 'self' would silently break every workspace/user avatar
      // in any deployment that isn't using the local-disk StorageService
      // provider — a real regression this phase's grep-only pass would
      // have missed without tracing avatarUrl's actual source.
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      `connect-src 'self' ${apiOrigin} ${apiWsOrigin}`,
      "object-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
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
