# Module 15 Community Edition Guarantee Review

Scope: verify Module 15's additions (billing/monetization, usage/quotas,
marketplace security, API platform hardening, integrations, AI cost
control, privacy/telemetry, i18n/accessibility, onboarding/demo,
health/error-handling/support, release engineering, feature flags) hold
the platform's standing guarantee — no mandatory paid service, a
self-hosted deployment fully functional with zero external accounts,
external/paid services always opt-in. Static review; no live cluster
stood up (same limitation every prior guarantee review in this directory
discloses).

**Result: guarantee holds. No violations found.**

## Findings

**1. `BILLING_PROVIDER` defaults to `none`.** `env.validation.ts`:
`z.enum(['none', 'stripe', 'manual']).default('none')`.
`BillingService`/`SubscriptionService` still create a real `Subscription`
row per organization even with no provider configured — pinned to
`PlanTier.FREE`, whose `Plan.limits` (`packages/shared/src/plan-defaults.ts`)
are `UNLIMITED` on every metered resource by seed default. No Stripe
account, no API key, and no external network call is required to use any
core feature (recon, vuln scanning, AI chat, reports, workflows,
plugins) on the default configuration.

**2. `StripeWebhookController`/`StripePaymentProvider` are additive, not
required.** Registered unconditionally as a controller (harmless — it
just 503s if `STRIPE_WEBHOOK_SECRET` is unset), but nothing else in the
request path depends on Stripe being configured. `BILLING_PROVIDER=none`
means `PaymentProviderFactory` never even constructs a `StripePaymentProvider`
instance.

**3. No M15 route uses `@RequiresEdition('enterprise')`.** Searched every
new controller (`billing/`, `feature-flags/`, `support/`, the new
`observability` additions) — the only Enterprise-gated routes in the
entire codebase remain the pre-existing Module 14 tenant-management ones
(`enterprise/controllers/organizations.controller.ts` and friends), which
this module didn't touch. Billing, quotas, feature flags, and support are
all reachable identically regardless of `PENTESTHUB_EDITION`.

**4. `QuotaService`'s enforcement is opt-in by construction.** A quota
only ever blocks an action if a `QuotaPolicy` row exists at some scope,
or the org's `Plan.limits` entry for that resource is non-null. A
self-hosted deployment on the default `FREE` plan and default (empty)
`QuotaPolicy` table sees `resolveLimit()` return `{ softLimit: null,
hardLimit: null }` for everything, which `QuotaService.check()` maps
directly to `allowed: true` with no database write and no throttling.

**5. `FeatureFlagsService`'s `editionRules.minEdition: "enterprise"` is
per-flag, opt-in, and defaults to absent.** `FeatureFlag.editionRules`
is nullable; a flag with no `editionRules` evaluates purely on
`defaultEnabled`/overrides, never on edition. No seed data or migration
in this module creates a flag that gates a core feature behind
`minEdition: "enterprise"` — the mechanism exists for a deployment
operator to use, but Module 15 itself doesn't use it against anything.

**6. Marketplace security additions apply uniformly, not as a paid
gate.** Publisher verification, checksums, and permission-declaration
enforcement (task #333/#334) are integrity/trust controls that apply the
same way regardless of `PlanTier` or `PENTESTHUB_EDITION` — a self-hosted
Community deployment gets the same signature/checksum verification as a
hosted Enterprise one; nothing about marketplace security itself requires
a paid plan.

**7. `MAIL_PROVIDER` defaults to `DevMailService`** (writes to
`.mail-outbox/` — Module 1, unchanged), so the new Support ticket flow
and Stripe confirmation-email-adjacent paths work with zero mail
infrastructure configured; `MAIL_PROVIDER=smtp` (task #338) is opt-in and
accepts any SMTP relay, free or paid, self-hosted or not.

**8. `RELEASE_CHANNEL` and the `CHANGELOG.md`/versioning work (task
#356) have no runtime cost or gating implication** — purely descriptive
metadata.

**9. `SUPPORT_INBOX_EMAIL` defaults to a placeholder address** (`support@pentesthub.ai`)
rather than requiring configuration — the ticket-intake endpoint still
functions (writes the row, attempts to email, logs a failure via the
existing "channel failures never break the write" posture if mail isn't
configured) even on a deployment that never sets this variable.

## Conclusion

Every Module 15 subsystem reviewed defaults to free/local/self-hosted
behavior, treats every paid-adjacent integration (Stripe, SMTP) as
strictly opt-in with graceful degradation when unconfigured, and
introduces no new Enterprise-only gate on core functionality. The
guarantee holds.
