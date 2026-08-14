# Stripe Webhook — Architecture

Module 15, task #366.

## Why a second webhook controller

`apps/api/src/modules/enterprise/controllers/billing-webhook.controller.ts`
(Module 14) already exists: a generic, shared-secret-authenticated
receiver (`x-billing-webhook-secret` vs `BILLING_WEBHOOK_SECRET`) that
updates only the legacy `Organization.plan`/`subscriptionStatus` string
columns via `HandleBillingWebhookCommand`. It predates the Module 15
`Subscription`/`Invoice`/`Plan` tables and its own doc comment explicitly
invites exactly this kind of provider-specific extension rather than
being edited to grow Stripe-specific behavior:

> "a deployment that adds one should normalize that provider's own
> webhook payload into `BillingWebhookEventDto`'s shape (and additionally
> verify that provider's own HMAC signature) before or instead of relying
> on this shared-secret check alone"

`StripeWebhookController`
(`apps/api/src/modules/billing/controllers/stripe-webhook.controller.ts`)
is that extension: `POST /billing/webhook/stripe`, `@Public()`, verifies
Stripe's own signature scheme against `STRIPE_WEBHOOK_SECRET` (not the
shared `BILLING_WEBHOOK_SECRET`), and writes directly into the Module 15
`Subscription`/`Invoice` tables via `SubscriptionService`/`InvoiceService`.
The Module 14 controller is untouched — both can run side by side; a
deployment only configures the one matching its actual provider.

## Signature verification (hand-rolled, no `stripe` SDK)

Stripe signs webhooks with `Stripe-Signature: t=<unix_ts>,v1=<hex_hmac>`.
Verification: HMAC-SHA256 of `${timestamp}.${rawBody}` using
`STRIPE_WEBHOOK_SECRET`, compared against the provided `v1` value with
Node's `timingSafeEqual` — same length-independent-timing posture as
`BillingWebhookController`'s `secretsMatch()`. A `t=` more than 5 minutes
(Stripe's own default tolerance) from server time is rejected as a
possible replay.

No `stripe` npm package dependency, consistent with
`StripePaymentProvider`'s already-established "plain `fetch()`, zero
unnecessary runtime dependencies" precedent — the signing scheme is
publicly documented and stable, and this file is the only place in the
codebase that would need to change if a project maintainer later prefers
the official SDK's constant-time comparison helper instead.

## Raw body requirement

Signature verification needs the *exact* bytes Stripe sent — re-serializing
the already-parsed JSON `req.body` would not reproduce them byte-for-byte
(key order, whitespace). `apps/api/src/main.ts` now passes
`rawBody: true` to `NestFactory.create()`, Nest's built-in option that
attaches raw bytes as `req.rawBody` alongside the normal parsed body for
every route. This has no effect on any existing route — nothing else in
the codebase reads `req.rawBody`.

## Event handling

- `checkout.session.completed` — deliberately a no-op. This event's
  payload only carries customer/subscription *IDs*, not the authoritative
  status/period fields; Stripe always follows a completed checkout with a
  `customer.subscription.created` event carrying the full object, so
  handling that instead avoids writing a partial/guessed state.
- `customer.subscription.created` / `customer.subscription.updated` —
  `SubscriptionService.applyStripeWebhookUpdate()`: upserts status,
  provider subscription id, current period, `cancelAtPeriodEnd`, and
  (if the subscription's first price ID matches a configured
  `Plan.providerMetadata.stripe.monthlyPriceId`) the plan tier.
- `customer.subscription.deleted` — same path, forced to `CANCELED` and
  `FREE`, mirroring `SubscriptionService.cancel(atPeriodEnd=false)`'s
  existing immediate-cancel behavior.
- `invoice.paid` / `invoice.payment_failed` — `InvoiceService.sync()`,
  which pulls the provider's current invoice/payment-method list for that
  customer (already-existing Module 15 logic from task #331).
- Anything else — logged at debug level and ignored.

## Known gaps (tracked, not silently dropped)

- **Multi-item subscriptions are out of scope.** Plan-tier resolution
  only reads the first line item's price (`items.data[0].price.id`) —
  every plan this app's own checkout flow creates is single-price (see
  `StripePaymentProvider.createCheckoutSessionForPrice`'s
  `line_items[0][price]`), so a subscription with multiple items just
  won't have its plan tier updated by this path (status/period fields
  still update normally).
- **No idempotency/event-id dedupe table.** Stripe can and does redeliver
  the same event; `applyStripeWebhookUpdate`'s writes are naturally
  idempotent (each field is set to the event's own value, not
  incremented/appended), so a duplicate delivery is harmless here, but a
  true idempotency ledger (reject a `event.id` already processed) is not
  implemented — a future pass could add a small `StripeWebhookEvent(id)`
  table if a deployment needs strict duplicate-delivery auditing.
- **`npx prisma generate` has not been run in this sandbox** — same
  standing gap disclosed for every Module 15 schema change this session
  (`SubscriptionService`/`InvoiceService` already carried this caveat
  from task #328/#331; nothing new introduced by this task). The
  consolidated migration is task #365's `migration.sql`.
- **No automated test exercises this controller.** `jest` remains
  unrunnable in this sandbox (package physically absent from the pnpm
  store — see PROJECT_SPEC.md's standing sandbox-limitations section).
  Verified by manual code review only; see task #366's completion
  metadata for exactly what was and was not checked, and what must be
  re-verified on a normal machine (`stripe listen --forward-to
  localhost:PORT/billing/webhook/stripe` + `stripe trigger
  customer.subscription.updated`, plus a full `tsc --noEmit` and
  `pnpm --filter api lint`).
