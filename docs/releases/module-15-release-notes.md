# Module 15 Release Notes — Production Hardening, Monetization & Marketplace

Dedicated deep-dives: `docs/architecture/{health-diagnostics,error-handling,
support-system,stripe-webhook,release-engineering}.md`.

## Features added

**Billing & monetization** — `PaymentProvider` interface with a Stripe
adapter (`StripePaymentProvider`, plain `fetch()`, deliberately no
`stripe` npm dependency), `SubscriptionService`/`InvoiceService`/
`EntitlementService`/`QuotaService` over new `Subscription`/`Invoice`/
`Plan`/`PaymentMethod`/`QuotaPolicy`/`UsageCounter` tables, hosted
checkout, and a dedicated `StripeWebhookController`
(`POST /billing/webhook/stripe`) that verifies Stripe's own HMAC
signature scheme independently of the pre-existing generic, shared-
secret Module 14 billing webhook.

**Usage & quotas** — `UsageService` meters AI/scan/recon/worker/storage
consumption; `QuotaEnforcer` checks configurable `QuotaPolicy` rows
before allowing metered actions to proceed, returning a structured
`QUOTA_EXCEEDED` error rather than a generic failure.

**Marketplace security** — publisher verification and registration,
package checksums, a scan-result/security-advisory pipeline, and
enforced per-plugin permission declarations (`PluginPermissionGrant`) —
a plugin cannot silently gain a capability its manifest didn't declare.

**API platform hardening** — a versioned Public API v1 layer, expanded
API key management (IP allowlists, per-key rate limits, rotation
lineage), and webhook platform improvements (delivery replay,
enable/disable, new event types).

**Integrations** — Slack, Discord, Telegram, email, GitHub, GitLab,
Jira, Linear, Microsoft Teams, and a generic outbound webhook, all behind
one `IntegrationConnection`/`IntegrationProvider` abstraction (Module 10
lineage, extended here with the concrete connector implementations).

**AI cost control** — `AiModelPricingService` + `AiBudgetEnforcerService`
enforce per-workspace/organization spend budgets and alert thresholds,
with provider/model fallback when a budget is exhausted mid-conversation.

**Privacy & compliance groundwork** — self-service data export/deletion,
telemetry opt-out (`UserPreferences.telemetryOptOut`), and an opt-in,
privacy-aware telemetry collector (`TelemetryModule`, off by default).

**Global reach** — i18n architecture spanning English, Uzbek, and
Russian; an accessibility audit across web, mobile, and desktop.

**Onboarding & trial experience** — a first-run onboarding flow and an
isolated, read-only demo mode (`Workspace.isDemo`/`demoExpiresAt`,
`POST /demo/session` public + rate-limited) that never touches a real
user's data.

**Operability** — `GET /observability/health/diagnostics` (public,
always-200, real DB round-trip + process metadata) backing a Settings →
Diagnostics page with one-click "attach to support ticket"; every
`AppException` now threads a request-correlation ID from
`AsyncLocalStorage` through to the JSON error body and, on the web app,
through root and dashboard-segment React error boundaries.

**Support** — `POST /support/tickets` (public, rate-limited, optional
diagnostics-snapshot attachment) plus an authenticated "my tickets" list,
deliberately without an in-app triage queue (no deployment-wide admin
role exists yet — see `docs/architecture/support-system.md`).

**Release engineering** — `CHANGELOG.md`, a `RELEASE_CHANNEL` env var
(stable/beta/nightly, informational), and root/app `package.json`
versions synchronized to the module-tracking scheme for the first time.

## Known gaps

- **`npx prisma generate` / a real migration have not run in this
  development sandbox** — the `prisma` CLI package is physically absent
  from the local pnpm store (same category as the already-disclosed
  `jest` gap). Every Module 15 schema change is captured in one
  consolidated `apps/api/prisma/migrations/20261001000000_production_hardening_monetization_marketplace/migration.sql`
  that must be verified with `prisma migrate diff` against a real
  database before use.
- **A stricter variant of the same sandbox limitation was discovered
  while verifying the Stripe webhook (task #366): the root `package.json`
  is missing for `@nestjs/common`, `@nestjs/swagger`, `@nestjs/cqrs`,
  `@nestjs/config`, and `@prisma/client` in this sandbox's pnpm store** —
  meaning a full `apps/api` `tsc --noEmit` cannot complete in this
  environment at all, not merely slowly. All Module 15 backend code from
  this point forward was verified by direct manual review (reading
  source `.d.ts` files, cross-checking type names against
  `packages/shared`) rather than a compiler pass; a full `pnpm install &&
  pnpm turbo run build lint check-types test` must be run on a normal
  machine before this module ships.
- **RESOLVED in Module 19.** ~~**Billing UI** (`/billing`, `/pricing`,
  `/settings/billing`) is not yet built — `SubscriptionDto`/`PlanDto`/
  `InvoiceDto` and their endpoints exist and are usable from any client,
  but no web page renders them yet. Tracked separately, not part of
  Module 15's completion scope.~~ Built in Module 19 (task #332):
  `/pricing`, `/settings/billing`, `/settings/usage` — see
  `docs/reviews/0022-module-19-backlog-reconciliation.md` and the
  Module 19 final report for exact routes and known limitations (no
  public/logged-out pricing page; single-organization assumption for
  users in more than one organization).
- **Feature flags admin UI** — `FeatureFlagsService`/`FeatureFlagsController`
  (`GET/POST /feature-flags`, `POST /feature-flags/overrides`, `GET
  /feature-flags/evaluate`) and a web `useFeatureFlags()`/`useFeatureFlag()`
  hook pair were built after this note was first written (task #357); the
  management endpoints are reachable via Swagger/`curl` only — no admin
  page renders them yet, matching the "no deployment-wide platform-admin
  role" posture already established for the Support queue and Admin
  Console. See `docs/architecture/feature-flags.md`.
- **Tests were written for the highest-risk new logic** (Stripe webhook
  signature verification, `QuotaService.resolveLimit()`'s N+1 fix,
  `FeatureFlagsService.evaluateAll()`'s precedence rules — task #362) but
  **not executed** — `jest` remains physically absent from this sandbox's
  pnpm store. Each spec file's own doc comment discloses this and must be
  run (`pnpm --filter api test`) on a normal machine before this module
  ships.
