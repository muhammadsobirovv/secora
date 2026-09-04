import { createRequire } from "node:module";

// Module 14 — Auto Update: bakes this build's package.json version into
// the client bundle as NEXT_PUBLIC_APP_VERSION. `createRequire` rather
// than a JSON import-assertion — works across the Node versions this
// monorepo's various tooling targets without depending on a specific
// `import ... with { type: "json" }` engine cutoff.
const require = createRequire(import.meta.url);
const { version: appVersion } = require("./package.json");

// Module 18 — task #523 (Phase 21: security headers / frontend web
// security). apps/api's bootstrap.ts already applies helmet's security
// headers (CSP, HSTS, frameguard — see that file's doc comment); this
// frontend app had none of the equivalent browser-facing protections
// anywhere in the stack (no next.config.js headers(); proxy.ts — this
// codebase's Next.js middleware, renamed — only does the login-redirect
// UX check, no response headers; and deploy/nginx/lb.conf only fronts
// apps/api, not apps/web) — a real,
// previously-undisclosed gap, confirmed by grepping the whole
// apps/web tree for X-Frame-Options/Content-Security-Policy/
// Strict-Transport-Security and finding zero matches.
//
// `connect-src`/`frame-src` need to include the API's actual origin: the
// browser calls `NEXT_PUBLIC_API_URL` directly (see lib/api/client.ts),
// not through a same-origin Next.js proxy, so `'self'` alone would break
// every API call in any deployment where the API isn't served from the
// exact same origin as the web app (the common case — see
// deploy/k8s/12-web-deployment.yaml vs 10-api-deployment.yaml, two
// separate Services). `NEXT_PUBLIC_API_URL` is already a build-time env
// var (baked into the client bundle the same way NEXT_PUBLIC_APP_VERSION
// is, above), so its origin is knowable here at build time — computed
// once and reused for both the HTTP API origin and its `ws(s)://`
// equivalent (Module 12/16 real-time sync's WebSocket connection uses the
// same host).
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
  // Module 18 — task #523. `script-src 'self'` is intentionally left
  // strict (no `'unsafe-inline'`) — the App Router's hydration payload
  // ships as `<script id="__NEXT_DATA__" type="application/json">`,
  // which browsers never execute as script regardless of CSP (a
  // `type="application/json"` script tag isn't parsed as JavaScript),
  // and this codebase has no `next/script` inline-strategy usage or
  // hand-written inline `<script>` tags (grepped `apps/web/app` and
  // found none) — so nothing here should need loosening. `style-src`
  // does need `'unsafe-inline'`: React's `style={{...}}` prop renders as
  // an inline `style` HTML attribute, which CSP's `style-src` governs
  // exactly like a `<style>` tag unless inline styles are allowed (e.g.
  // features/ai/components/mermaid-diagram.tsx's pan/zoom transform) —
  // same trade-off bootstrap.ts already makes for the API's Swagger UI
  // page, for the same reason (inline style injection is a far weaker
  // primitive than inline script injection, and a nonce-based rewrite of
  // every inline style prop across the app is a much larger, harder-to-
  // verify-in-this-sandbox change than this phase's scope).
  async headers() {
    const csp = [
      "default-src 'self'",
      "script-src 'self'",
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
