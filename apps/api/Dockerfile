# Secora AI — API server (Module 10: Production Deployment).
#
# Multi-stage build run from the MONOREPO ROOT as build context (Turborepo
# workspace packages — @pentesthub/shared in particular — are real source
# directories symlinked via pnpm, not published npm packages, so `apps/api`
# alone can't be built in isolation):
#
#   docker build -f apps/api/Dockerfile -t pentesthub-api .
#
# Stage 1 (deps) installs the full workspace's dependencies once, so
# Stage 2's Prisma generate + tsc build and Stage 3's production
# `pnpm install --prod` both reuse the same resolved dependency tree
# instead of re-resolving twice. Stage 3 (runtime) copies over only the
# compiled dist/ output, generated Prisma client, and production
# node_modules — the TypeScript source, dev dependencies, and build
# tooling never reach the final image.
FROM node:25-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /workspace

# ---- deps: resolve the whole workspace's dependency graph once ----
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
COPY packages/agent-sdk/package.json packages/agent-sdk/package.json
COPY packages/sdk-typescript/package.json packages/sdk-typescript/package.json
RUN pnpm install --frozen-lockfile

# ---- build: compile TypeScript + generate the Prisma client ----
FROM deps AS build
COPY . .
RUN pnpm --filter api exec prisma generate
RUN pnpm --filter shared build
# apps/api imports @pentesthub/agent-sdk (Module 13 AI Agent SDK) and
# @pentesthub/sdk (packages/sdk-typescript) directly -- both must be
# compiled to dist/ before tsc can resolve them, same as shared above.
# @pentesthub/sdk MUST build first: agent-sdk/src/lifecycle.ts imports
# from @pentesthub/sdk, so building agent-sdk first fails the same
# "Cannot find module" error one level down.
RUN pnpm --filter @pentesthub/sdk build
RUN pnpm --filter @pentesthub/agent-sdk build
# tsc's default V8 old-space ceiling (~2GB) is consistently too small for
# this codebase's full-project compile (tsconfig.build.json), regardless
# of the host's actual RAM/swap -- it OOMs at the same ~2038MB every time.
# Raise the heap ceiling explicitly rather than relying on the default.
RUN NODE_OPTIONS="--max-old-space-size=6144" pnpm --filter api build

# ---- prod-deps: a second, production-only install (no devDependencies) ----
FROM base AS prod-deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/agent-sdk/package.json packages/agent-sdk/package.json
COPY packages/sdk-typescript/package.json packages/sdk-typescript/package.json
RUN pnpm install --prod --frozen-lockfile --filter api...

# ---- runtime: the actual production image ----
FROM node:25-bookworm-slim AS runtime
ENV NODE_ENV=production
# Non-root — this container never needs root, and running as one is an
# avoidable privilege-escalation surface if the process is ever
# compromised via a dependency vulnerability.
RUN groupadd --gid 1001 pentesthub && useradd --uid 1001 --gid pentesthub --shell /bin/bash --create-home pentesthub
WORKDIR /workspace
COPY --from=prod-deps /workspace/node_modules ./node_modules
COPY --from=prod-deps /workspace/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /workspace/packages/shared ./packages/shared
COPY --from=build /workspace/packages/agent-sdk ./packages/agent-sdk
COPY --from=build /workspace/packages/sdk-typescript ./packages/sdk-typescript
COPY --from=build /workspace/apps/api/dist ./apps/api/dist
COPY --from=build /workspace/apps/api/generated ./apps/api/generated
COPY --from=build /workspace/apps/api/prisma ./apps/api/prisma
COPY --from=build /workspace/apps/api/package.json ./apps/api/package.json
# LocalDiskStorageService's directory (process.cwd()/.storage), the mount
# point of docker-compose.yml's shared `api-storage` volume. Pre-created
# and owned by the runtime user so a fresh named volume inherits that
# ownership — otherwise Docker creates it root-owned and every write from
# this non-root process fails with EACCES. Same line in Dockerfile.worker.
RUN mkdir -p apps/api/.storage && chown pentesthub:pentesthub apps/api/.storage
# DevMailService (used whenever MAIL_PROVIDER is not "smtp") writes every
# outgoing email to process.cwd()/.mail-outbox. The non-root runtime user
# cannot create that directory under the root-owned app dir, so without
# this line signup and password reset answered HTTP 500 (EACCES).
RUN mkdir -p apps/api/.mail-outbox && chown pentesthub:pentesthub apps/api/.mail-outbox
USER pentesthub
WORKDIR /workspace/apps/api
EXPOSE 3000
# Container-level healthcheck hits the same liveness probe Kubernetes'
# readiness/liveness probes use (see deploy/k8s/api-deployment.yaml) —
# useful on its own for plain `docker run`/Compose deployments that have
# no external orchestrator doing the equivalent check.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/observability/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
# `npm run`/`pnpm run` inject `npm_package_version` (read from the
# nearest package.json) into every script's environment automatically —
# health.controller.ts's liveness/readiness bodies, worker.main.ts's boot
# log, cluster-overview.service.ts, tracing.ts, and telemetry-collector
# .service.ts all read that env var directly rather than re-parsing
# package.json themselves (same "one source of truth" reasoning as
# next.config.js's NEXT_PUBLIC_APP_VERSION). Running `node dist/...`
# directly, as this CMD did before, bypasses that injection entirely —
# the var is simply never set, every one of those call sites silently
# falls back to 'unknown', and apps/web's stale-build banner
# (use-app-version-check.ts) compares that 'unknown' against its own
# real, build-time-baked version and finds them permanently unequal —
# the banner never stops showing. Reading package.json's version at
# container startup and exporting it ourselves reproduces exactly what
# `npm run` would have done, without needing a package-manager wrapper
# process alive for the container's whole lifetime.
CMD ["sh", "-c", "export npm_package_version=$(node -p \"require('./package.json').version\") && exec node dist/src/main.js"]
