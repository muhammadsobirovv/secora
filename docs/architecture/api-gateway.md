# API Gateway (Module 14)

This platform does not run a separate API-gateway process (Kong, Envoy, AWS API Gateway, ...). "Gateway" here means the layer of cross-cutting concerns every request passes through inside `apps/api` itself, applied uniformly regardless of which module's controller ultimately handles the request. This document is a map of that layer: what exists, where it lives, and the two decisions (versioning, response caching) made specifically for Module 14.

## Request pipeline, in order

Every request passes through the following, applied globally in `apps/api/src/app.module.ts` and `apps/api/src/bootstrap.ts`:

1. **Helmet** (security headers, CSP) — `bootstrap.ts`.
2. **Compression** (gzip/deflate/brotli via the `compression` package) — `bootstrap.ts`. Explicitly skips `text/event-stream` responses so Module 5/11's AI chat streaming and Module 3/4's live job-log SSE endpoints are never buffered; falls through to the package's own default filter (which already respects `Cache-Control: no-transform` and skips already-compressed/non-compressible types) for everything else.
3. **Request ID middleware** — assigns/propagates `X-Request-Id` (`observability/request-id.middleware.ts`), so it's available to every guard/interceptor/handler/logger downstream.
4. **Trust proxy** — Express's proxy-hop count, set from `TRUST_PROXY_HOPS` so `req.ip` resolves correctly behind reverse proxies/load balancers.
5. **CORS** — `app.enableCors()`, origin from `FRONTEND_URL`.
6. **Guards**, in registration order (`app.module.ts`'s `providers` array, all `APP_GUARD`):
   - `ThrottlerGuard` — rate limiting (`ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])`; per-route overrides via `@Throttle()` where a module needs a tighter or looser limit).
   - `IpAllowlistGuard` — Module 14 Security; no-op unless `IP_ALLOWLIST` is configured.
   - `MtlsGuard` — Module 14 Security; no-op unless `MTLS_REQUIRED=true`.
   - `JwtAuthGuard` — the platform's primary auth (Bearer JWT); skipped on `@Public()` routes.
   - `RolesGuard` — workspace/organization role checks (`@Roles(...)`).
   - `EditionGuard` — Community vs Enterprise gating (`@RequiresEdition('enterprise')`).
7. **ValidationPipe** (global) — `whitelist: true, forbidNonWhitelisted: true, transform: true`.
8. **`ResponseInterceptor`** (global `APP_INTERCEPTOR`) — wraps every success response as `{ success: true, data }`.

Machine-to-machine callers (webhooks, API-key consumers, Module 10's worker-node register/heartbeat/claim/complete/fail routes) authenticate instead via **`ApiKeyAuthGuard`** (`apps/api/src/modules/public-api/guards/api-key-auth.guard.ts`), applied per-route with `@Public()` + `@UseGuards(ApiKeyAuthGuard)` rather than globally — see Module 9's Public API docs for key issuance/scopes/rate limits specific to that surface.

## Routing

No global path prefix (`app.setGlobalPrefix()` is not called). Every controller's `@Controller()` path is the literal route committed in `packages/shared/src/*-endpoints.ts` (e.g. `auth/register`, not `/api/auth/register`) — the shared endpoint-constant files are the single source of truth both the API and every client (web, desktop, mobile, CLI, SDKs) build requests from.

## Versioning policy

**Decision: no URI-based versioning (`/v1/...`) for this pass.** Reasoning:

- The API has no global path prefix by design (see Routing, above) — every route path is already committed as a literal string across `packages/shared`'s endpoint-constant files, every SDK (Python, Go, TypeScript), the web/mobile/desktop clients, and this repo's own webhook signature/URL documentation.
- Introducing `/v1/` would mean either (a) rewriting every one of those committed paths across every consumer — a breaking change to the entire platform in a single pass, explicitly out of scope given the standing "do not rewrite previous modules" constraint that has governed this whole build — or (b) mounting a parallel, unversioned-vs-versioned routing scheme, which is more surface area than this API's actual compatibility needs justify today (there is exactly one shipped API surface, one set of first-party consumers, all built from the same monorepo in lockstep).
- This API's real compatibility story so far has been additive: every module added new endpoints and new optional response fields without removing or repurposing existing ones (e.g. Module 14's tenant billing/branding fields were added to the existing `Organization`/`OrganizationDto` shape, not a new versioned copy of it).

**What to do instead, if/when a breaking change is unavoidable:**

- Prefer additive evolution (new optional fields, new endpoints) over changing an existing field's meaning or removing a field.
- If a genuinely breaking change to one endpoint is unavoidable, version that endpoint's path segment narrowly (e.g. `enterprise/organizations/:id/billing-v2`) rather than introducing a platform-wide `/v1/` prefix — the cost is scoped to the one endpoint that needs it, not every route.
- Track breaking changes in `docs/releases/` (release notes) the same way every module's release notes already do, so SDK/client consumers have a changelog to react to.
- If the API ever needs to support genuinely divergent client generations concurrently (not just true so far), revisit this decision as its own ADR — don't retrofit URI versioning piecemeal.

## Response caching

`CacheResponseInterceptor` (`apps/api/src/common/interceptors/cache-response.interceptor.ts`) + `@CacheResponse(ttlSeconds)` (`apps/api/src/common/decorators/cache-response.decorator.ts`) provide opt-in, per-route GET response caching backed by the `CACHE_SERVICE` abstraction (Module 14's memory/Redis/disk cache providers — same one the Admin Console's Cache page reports on).

Deliberately **opt-in per route, not a global interceptor**: most GET routes in this API return per-caller, frequently-changing data (job status, findings, chat history) where blanket caching would risk serving stale or, worse, cross-user data. Reach for `@CacheResponse(ttlSeconds)` only on routes that are read-heavy, relatively expensive, and safe to serve slightly stale for a short window — the first real consumer is `KnowledgeBaseReferencesController`'s `list`/`get` routes (Module 11's OWASP/CWE/CAPEC/MITRE/NIST/CVE reference catalog: curated content that changes only via explicit curator edits, cached for 300 seconds).

Cache keys are namespaced by the caller's user ID (`http-cache:<userId>:<originalUrl>`, falling back to `'anon'` on `@Public()` routes) so a cached response can never be replayed to a different caller. `CacheService` has no pattern-delete — only exact-key get/set/delete — so cached routes do not attempt invalidation on writes; callers accept up to the configured TTL of staleness after an edit. Routes with a lower staleness tolerance should use a shorter TTL rather than relying on invalidation this interceptor doesn't provide.

## Related docs

- `docs/security/secrets-management.md`, `docs/security/tls-mtls-certificates.md`, `docs/security/waf-compatibility.md` — Module 14 Security.
- Module 9's Public API docs — API keys, webhooks, OpenAPI, rate limits specific to the machine-to-machine surface.
- `docs/adr/0010-enterprise-platform.md` — multi-tenant/RBAC context the `EditionGuard`/tenant-scoped routes build on.
