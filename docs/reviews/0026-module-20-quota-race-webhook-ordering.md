# Module 20 — Phases 6-7: Quota Race & Webhook Ordering

Both gaps were disclosed in Module 19's monetization security review
(`0023-module-19-monetization-security-review.md`, findings #3 and #4).
This module audits each on its own merits per the spec's explicit
instruction not to assume they need fixing "blindly."

## Phase 6: Quota check-then-act race — audited, NOT fixed this module

**Confirmed still real.** Read `QuotaService.check()`/`.enforce()` in
full (`apps/api/src/modules/billing/quota.service.ts`). Both read the
current `UsageCounter` value, return a decision, and rely on the *caller*
to perform the metered action and separately call `UsageService.record()`
afterward — there is no atomic reserve-then-commit step. Two concurrent
requests can both read a counter just under its hard limit, both pass
`enforce()`, and both proceed; the limit can be exceeded by a small
margin under real concurrent load.

**Why this was not fixed in this module.** Closing it properly requires
turning "check, then act, then record" into a single atomic operation —
e.g. a conditional `UPDATE ... WHERE quantity + $n <= hard_limit`
(`prisma.usageCounter.updateMany()` with a computed limit in the `WHERE`
clause, mirroring the pattern used for the webhook-ordering fix below) —
and then updating **every metered call site** (AI chat, recon jobs, vuln
scan jobs, worker/storage consumption) to call that atomic
reserve-then-commit method instead of today's separate check-then-record
pair. Doing only half of that change is actively dangerous: if a call
site's existing `record()` call is left in place alongside a new atomic
"reserve," every metered action would be double-counted, silently
throttling users far more aggressively than intended — a worse defect
than the one being fixed. Enumerating and updating every metered call
site correctly, then verifying none of them regress, is real,
non-trivial, multi-file scope — explicitly the kind of "large redesign"
Module 20's own rules say not to attempt in this final pass, and this
sandbox has no working test runner to safely catch a regression in such
a change (see Verification below).

**Risk assessment.** A quota TOCTOU race allows a bounded, transient
overage (at most a handful of concurrent requests' worth) under genuine
concurrent load — a real but low-severity issue, not an unbounded or
critical one. Weighed against the risk of a rushed fix introducing
double-counting across the platform's metered surfaces, leaving this as
a documented, disclosed limitation is the safer choice for a final
release-engineering pass. This is a good candidate for dedicated,
carefully-tested future work (a real, scoped module of its own), not a
final-hour patch.

**Conclusion:** REAL, DISCLOSED, NOT FIXED. Documented here and in the
final report's Known Limitations, consistent with the spec's explicit
option to "document the conclusion instead of changing it" when a fix
isn't safe to make within existing architecture in this pass.

## Phase 7: Webhook event ordering — audited and FIXED

**Confirmed real.** `StripeWebhookController`'s `StripeEventEnvelope`
never captured Stripe's own `created` (event timestamp) field, and
`SubscriptionService.applyStripeWebhookUpdate()` unconditionally
overwrote `Subscription` state with whatever event arrived, with no
check against what was already applied. An out-of-order redelivery of an
older `customer.subscription.updated` event after a newer one had
already been processed could silently revert the subscription to stale
state (e.g. `active` → `past_due` overwritten back to a stale `active`,
or vice versa).

**Why this one was safe to fix, unlike Phase 6.** The fix touches exactly
one write path (`applyStripeWebhookUpdate`, called from exactly one
caller, `StripeWebhookController`) rather than dozens of metered call
sites — a narrow, well-contained change.

**What was implemented**, using the existing billing architecture (no
new system, per the spec's "use existing billing architecture" guidance):

1. **Schema**: two new nullable columns on `Subscription` —
   `lastWebhookEventId` (the provider event ID) and `lastWebhookEventAt`
   (the provider's own `created` timestamp of the last event actually
   applied). Migration:
   `apps/api/prisma/migrations/20261205000000_billing_webhook_event_ordering/migration.sql`
   — pure additive, `NULL` for every existing row (meaning "no guard yet,"
   which the code treats as "always accept," the correct default for a
   subscription that predates this fix or was never touched by a
   webhook).
2. **`StripeEventEnvelope`** now captures `created: number` (Stripe's
   Unix-seconds event timestamp), threaded through `handleEvent()` →
   `applySubscriptionObject()` → `SubscriptionService.applyStripeWebhookUpdate()`.
3. **The ordering guard is a single atomic `updateMany()`** whose `WHERE`
   clause re-checks `lastWebhookEventAt <= incomingEvent.createdAt` (or
   `lastWebhookEventAt IS NULL`) *at write time*, not just at the earlier
   `findByProviderCustomerId` read — this is the detail that makes it
   correct under concurrency, not just under sequential delivery: two
   webhook deliveries racing for the same subscription can't both "win,"
   because Postgres serializes the two `UPDATE`s and whichever has the
   older `eventCreatedAt` finds zero matching rows and skips, even if it
   read the row before the other one wrote. A same-timestamp redelivery
   (`lte`, not `lt`) is still allowed through — this preserves the
   already-correct "duplicate delivery of the same event is a harmless
   re-apply" property from the original security review, which only
   flagged *different, out-of-order* events as the real gap.
4. **A stale/out-of-order event is now logged and skipped** rather than
   applied — `SubscriptionService` logs a warning with the event ID,
   timestamp, and subscription ID so a stale-event-arrival pattern is
   visible in logs rather than silent.

**Files changed**: `apps/api/prisma/schema.prisma`,
`apps/api/prisma/migrations/20261205000000_billing_webhook_event_ordering/migration.sql`,
`apps/api/src/modules/billing/subscription.service.ts`,
`apps/api/src/modules/billing/controllers/stripe-webhook.controller.ts`,
`apps/api/src/modules/billing/controllers/stripe-webhook.controller.spec.ts`
(updated fixtures + a new assertion), and a new
`apps/api/src/modules/billing/subscription-webhook-ordering.spec.ts`
(three regression tests: applies a newer event, skips a stale one without
throwing, always applies the first-ever event for a subscription with no
prior `lastWebhookEventAt`).

**What this does NOT cover**: invoice sync (`InvoiceService.sync()`) is
untouched — it was never the flagged gap (idempotent by
`providerInvoiceId` upsert already) and Module 19's review specifically
scoped the ordering concern to *subscription* status transitions.

## Verification

- Both new/changed `apps/api` files —
  `tsc --noEmit --noResolve --experimentalDecorators` (structural check)
  — **PASS**, zero errors beyond expected module-not-found (environment)
  noise and `TS2580: Cannot find name 'Buffer'/'process'`. The latter is
  confirmed a tooling artifact, not a real defect: TypeScript's own error
  text ("Do you need to install type definitions for node?") identifies
  it as a missing-`@types/node` resolution gap caused by `--noResolve`
  itself, not a code issue — and the `process.env.FRONTEND_URL` line it
  flags in `subscription.service.ts` is pre-existing code inside the
  unrelated `upgrade()` method, not something introduced by this fix.
- Also attempted a real `tsc -p tsconfig.check.json --noEmit` (temporary
  tsconfig extending `apps/api`'s real one, scoped to just the
  changed/new files) to get higher-confidence verification, mirroring
  the technique that worked for `apps/web` in this module. Unlike
  `apps/web`, `apps/api`'s `node_modules` cannot support this: it reports
  `Cannot find module '@nestjs/common'` for every NestJS import
  throughout the codebase, and — more tellingly — `Property 'subscription'
  /'plan'/'organization' does not exist on type 'PrismaService'`, which
  means the generated Prisma Client types themselves are stale/absent in
  this sandbox. This reproduces identically against completely untouched
  files (`invoice.service.ts`, `prisma.service.ts`), confirming it's the
  same pre-existing "`prisma generate`/full install cannot run in this
  sandbox" limitation disclosed since Module 15, not something this fix
  caused. **Conclusion: a real full-resolution `tsc` check is not
  feasible for `apps/api` in this sandbox; the `--noResolve` structural
  check above is the strongest verification available here.**
- `apps/api` jest — **VERIFICATION_BLOCKED**, same environment limitation
  disclosed throughout this project (`node_modules/.bin/jest` resolves to
  a broken symlink in this sandbox's partial pnpm install). Both new spec
  files were written and manually traced against the real implementation
  they test, following this codebase's established "write it, disclose
  the block, must run on a normal machine before shipping" convention
  (see `quota.service.spec.ts`'s own doc comment for the same pattern).
- The migration SQL was hand-written (matching Module 15's precedent for
  schema changes in this sandbox) and could not be applied against a
  live database — `npx prisma migrate` cannot run here (established,
  disclosed limitation since Module 15). **Architecture: implemented.
  Code-level: verified by manual trace + written regression tests.
  Live-database verification: BLOCKED**, per the spec's explicit
  instruction to separate these two kinds of verification when live
  verification is unavailable.

## Summary

Quota race: real, disclosed, deliberately not fixed this module — the
correct fix requires touching every metered call site and this sandbox
cannot safely verify such a change. Webhook ordering: real, fixed with a
narrow, single-call-site, additive schema change plus an atomic
conditional update, with regression tests written (execution blocked by
the sandbox's known jest limitation).
