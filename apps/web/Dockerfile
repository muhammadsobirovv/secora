# Secora AI — Next.js web frontend (Module 10: Production
# Deployment). Build from the monorepo root:
#
#   docker build -f apps/web/Dockerfile -t pentesthub-web \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.your-company.com .
#
# `NEXT_PUBLIC_*` env vars are inlined into the client JS bundle at
# *build* time by Next.js, not read at container start — hence the
# `--build-arg`/`ARG`/`ENV` dance below rather than a runtime env file,
# which is a common Next.js Docker gotcha worth calling out explicitly.
FROM node:22-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /workspace

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/desktop/package.json apps/desktop/package.json
COPY apps/browser-extension/package.json apps/browser-extension/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
ARG NEXT_PUBLIC_API_URL=http://localhost:3000
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
COPY . .
RUN pnpm --filter shared build
RUN pnpm --filter web build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
RUN groupadd --gid 1001 pentesthub && useradd --uid 1001 --gid pentesthub --shell /bin/bash --create-home pentesthub
WORKDIR /workspace/apps/web
# `.next/standalone` (see next.config.js's `output: "standalone"`)
# already contains a minimal `node_modules` traced from this app's
# actual imports plus a generated `server.js` entrypoint — no separate
# production `pnpm install` stage needed, unlike the API image.
COPY --from=build /workspace/apps/web/.next/standalone ./
COPY --from=build /workspace/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /workspace/apps/web/public ./apps/web/public
USER pentesthub
EXPOSE 3001
ENV PORT=3001
ENV HOSTNAME=0.0.0.0
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3001').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
