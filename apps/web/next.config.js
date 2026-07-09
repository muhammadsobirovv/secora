/** @type {import('next').NextConfig} */
const nextConfig = {
  // @pentesthub/shared ships TypeScript source directly (no build step,
  // see packages/shared/package.json) — Next needs to know to compile it
  // into the bundle rather than treating it as pre-built.
  transpilePackages: ["@pentesthub/shared"],
};

export default nextConfig;
