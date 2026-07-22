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
};

export default nextConfig;
