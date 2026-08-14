# ADR 0015 — Production Hardening, Monetization & Marketplace

## Status

Accepted (source-complete; verification loop constrained by a sandbox
toolchain gap more severe than any prior module's — see §Verification
constraints).

## Context

Module 14 made the platform survive a node failure and scale
horizontally. What it didn't do — and what every prior module's release
notes flagged as deferred — is answer the questions a project needs
answered before real users and real money touch it: how does it charge
anyone, how does it stop one workspace from exhausting shared resources,
how does it know a marketplace plugin hasn't been tampered with, how does
a self-hosted operator get support and diagnose problems without SSH
access, and how does it behave for a user who doesn't speak English or
relies on a screen reader. Module 15 closes that list: billing/
monetization, usage quotas, marketplace security, API platform hardening,
integrations, AI cost control, privacy/telemetry groundwork, i18n/
accessibility, onboarding/demo mode, operability (health diagnostics,
structured error handling, support), release engineering, and feature
flags — all under the same non-negotiable constraint every prior module
has carried: **no mandatory paid service, self-hosted deployment fully
functional, every external/paid integration strictly opt-in.**

## Decisions

**1. Billing is a provider abstraction with `none` as the default, not a
Stripe dependency.** `PaymentProvider` is an interface; `StripePaymentProvider`
is one implementation, built on plain `fetch()` deliberately without the
`stripe` npm SDK (avoiding a large dependency and its own version-drift
surface for a v1 integration). `BILLING_PROVIDER` defaults to `'none'`,
and `SubscriptionService` still creates a real `Subscription` row per
organization even with no provider configured, pinned to `PlanTier.FREE`
whose `Plan.limits` are `UNLIMITED` by seed default — so billing
machinery existing in the schema never implies a deployment must pay for
anything.

**2. Two independent Stripe webhook paths, not one shared secret reused
for two purposes.** Module 14 already had a generic, shared-secret
billing webhook. Module 15's `StripeWebhookController`
(`POST /billing/webhook/stripe`, task #366) is deliberately separate: it
verifies Stripe's own `Stripe-Signature: t=<ts>,v1=<hex_hmac>` scheme
(HMAC-SHA256 over `${timestamp}.${rawBody}`, `timingSafeEqual` comparison,
5-minute replay tolerance) against `STRIPE_WEBHOOK_SECRET`, independent of
the older mechanism, rather than overloading one verification path with
two different signature formats. See `docs/architecture/stripe-webhook.md`.

**3. Usage metering and quota enforcement are additive and opt-in by
construction.** `UsageService` meters consumption unconditionally (cheap,
useful for dashboards regardless of billing), but `QuotaService.check()`
only ever blocks an action if a `QuotaPolicy` row exists at some scope
(USER/WORKSPACE/ORGANIZATION) or the org's `Plan.limits` entry for that
resource is non-null — an empty `QuotaPolicy` table and the default
`UNLIMITED` `FREE` plan together mean a self-hosted deployment sees
`allowed: true` for everything, with no throttling and no extra write on
the hot path. Task #358's performance pass collapsed what had been up to
three sequential `findFirst()` calls (one per candidate scope) into a
single `findMany()` with an `OR` across all candidates, picking the most
specific match in memory — a real N+1 fix, not just a documentation pass.

**4. Marketplace security is integrity tooling that applies uniformly,
not a paid gate.** Publisher verification/registration, package
checksums, a scan-result/security-advisory pipeline, and enforced
per-plugin permission declarations (`PluginPermissionGrant` — a plugin
cannot silently gain a capability its manifest didn't declare) apply the
same way regardless of `PlanTier` or `PENTESTHUB_EDITION`. This is a
trust boundary around third-party code, not a monetization lever.

**5. Feature flags resolve through one deterministic precedence order,
reusing `EditionService` rather than building a parallel edition check.**
`FeatureFlagsService.evaluateAll()` resolves each flag as: USER override
> WORKSPACE override > ORGANIZATION override > `editionRules` (AND of
`minEdition`/`selfHostedOnly`/`planTiers`/`betaOnly`/`developerOnly`) >
`defaultEnabled`. `editionRules.minEdition` calls
`EditionService.isEnterpriseFor(organizationId?)` — the same Module 14
service `TenantController`'s `EditionGuard` already depends on — rather
than re-implementing Community-vs-Enterprise detection a second time.
`editionRules` is nullable and unused by any flag this module ships,
matching the "no deployment-wide platform-admin role" posture: the two
management endpoints (`POST /feature-flags`, `POST
/feature-flags/overrides`) are real and functional but reachable via
Swagger/`curl` only, same disclosed scope decision as the Support ticket
queue (task #355) and the Module 14 Admin Console before it. See
`docs/architecture/feature-flags.md`.

**6. Operability additions are diagnostic surfaces over existing state,
not a new monitoring subsystem.** `GET /observability/health/diagnostics`
is public, always-200, and does a real DB round-trip plus process
metadata — designed so a self-hosted operator (or a Support ticket
submitter) can get a paste-able health snapshot with zero extra
infrastructure. Every `AppException` threads a request-correlation ID
from `AsyncLocalStorage` through to the JSON error body and, on the web
app, through root and dashboard-segment React error boundaries — one ID
a user can quote back in a support ticket, not a new logging pipeline.

**7. Support is a ticket queue without a triage UI, for the same
architectural reason Module 14's Tenant Management stayed Enterprise-only
and the Admin Console stayed read-oriented: no deployment-wide
platform-admin role exists yet.** `POST /support/tickets` (public,
rate-limited, optional diagnostics-snapshot attachment) plus an
authenticated "my tickets" list are real and usable today; building a
staff-facing triage queue on top of a role that doesn't exist would mean
inventing that role's authorization model as a side effect of a support
feature, which this module deliberately declines to do. See
`docs/architecture/support-system.md`.

**8. Release engineering starts the version-tracking discipline this
project didn't have before.** Root and per-app `package.json` versions
are synchronized to the module-tracking scheme for the first time
(`0.15.0` for Module 15), `CHANGELOG.md` now exists at the repo root
following Keep a Changelog format back to `0.1.0`, and `RELEASE_CHANNEL`
(`stable`/`beta`/`nightly`, default `stable`) is surfaced on `GET
/observability/health`'s liveness response as informational metadata —
no code path branches on it yet, deliberately, since nothing in this
module needed channel-specific behavior.

**9. Privacy and i18n/accessibility are groundwork, explicitly scoped as
such.** Self-service data export/deletion and telemetry opt-out
(`UserPreferences.telemetryOptOut`) give a data subject real control
today; the opt-in, privacy-aware `TelemetryModule` collects nothing by
default. i18n architecture spans English, Uzbek, and Russian; the
accessibility audit (`docs/reviews/0009-accessibility-audit.md`) covers
web, mobile, and desktop. Neither claims to be a finished compliance
program — `docs/compliance/gdpr-readiness.md` and this module's new
`PRIVACY.md` say plainly what's implemented versus what a real deployment
operator still needs to configure (a monitored contact address, a
jurisdiction-specific retention policy, a DPA with any sub-processor they
choose to enable).

## Consequences

- Two independent billing-webhook verification paths (Module 14's
  generic shared-secret one and this module's Stripe-specific HMAC one)
  must both be kept correct going forward; a future payment-provider
  integration should get its own dedicated verification path rather than
  being squeezed into either existing one, consistent with the
  provider-abstraction pattern `PaymentProvider` already establishes.
- `QuotaService.resolveLimit()`'s single-`findMany()` shape is now the
  precedent for any future multi-scope lookup in this codebase — a
  sequential `findFirst()`-per-candidate loop introduced elsewhere should
  be treated as a regression of the same class this task fixed.
- `FeatureFlagsService` is now the second consumer of
  `EditionService.isEnterpriseFor()` alongside `EditionGuard` — any
  future Community-vs-Enterprise check should call this same method
  rather than re-deriving edition state from `License` rows directly.
- The "no deployment-wide platform-admin role" gap, now load-bearing for
  three separate features (Tenant Management, Support triage, Feature
  Flags management), is large enough that it should be treated as its
  own future module rather than continuing to be worked around
  feature-by-feature.
- The Billing UI and Feature Flags admin UI are the two largest
  end-user-facing gaps this module leaves open; both are already tracked
  as separate follow-up work rather than silently absorbed into "Module
  15 is done."

## Verification constraints (sandbox)

This module's sandbox constraint is a **strictly worse variant** of
Module 14's: not just "`pnpm install`/network/build tooling is slow or
absent," but, discovered during task #366's Stripe webhook work, **the
root `package.json` files for `@nestjs/common`, `@nestjs/swagger`,
`@nestjs/cqrs`, `@nestjs/config`, and `@prisma/client` are physically
missing from this sandbox's pnpm content-addressable store**, even though
nested files within each package are present. Confirmed two independent
ways: `find`/`ls` on the resolved store path showing `total 0` with only
subdirectories and no `package.json`, and a plain `node -e
"require.resolve('@nestjs/common')"` failing with `MODULE_NOT_FOUND` —
ruling out a TypeScript-specific resolution quirk. This means:

- `apps/api`'s `tsc --noEmit` **cannot complete in this sandbox at all**,
  not merely slowly — every scoping/incremental/caching workaround
  attempted (see task #366's disclosure) still hits the same missing-file
  wall.
- `jest` is unrunnable here (same standing gap disclosed since earlier
  modules) — three new spec files (`feature-flags.service.spec.ts`,
  `stripe-webhook.controller.spec.ts`, `quota.service.spec.ts`, task #362)
  were written and manually traced against their targets' actual control
  flow but have never executed.
- `npx prisma generate` / a real migration have not run here — the
  `prisma` CLI package is absent from the local pnpm store, same category
  of gap. Module 15's schema changes are captured in one consolidated
  migration file that must be verified with `prisma migrate diff` against
  a real database.
- Background/detached processes (nohup, disown, setsid) were empirically
  confirmed **not to persist across separate sandbox tool invocations**
  in this environment, which rules out a "launch a long build in the
  background and poll later" workaround for any of the above.

What **was** done instead, disclosed per-task throughout this module:
direct manual review of every new/changed source file (reading
`.d.ts` signatures where available, cross-checking type names against
`packages/shared`'s actual exports, tracing control flow by hand against
each new spec file's assertions). This is real verification effort, but
it is not a substitute for an actual compiler pass, lint run, or test
execution. A normal development machine must run `pnpm install &&
pnpm --filter api prisma generate && pnpm --filter api prisma migrate dev
&& pnpm turbo run build lint check-types test` before this module is
considered production-ready — see the module's final completion report
for the exact outstanding checklist.
