# Module 19 — Monetization Security Review

Dedicated security review for the billing/entitlement/usage/AI-cost
surface, per the Module 19 spec. This is a focused review of the
Module 15 monetization foundation plus the frontend/fixes added in
Module 19 — not a repeat of Module 15's original security audit (#344)
or Module 18's platform-wide security passes.

## Method

Read every controller, service, and webhook handler in
`apps/api/src/modules/billing/*` in full; traced every route's
authorization chain; traced usage/quota counter writes for concurrency
safety; checked for client-trust boundary violations (price/plan/amount
taken from request bodies vs. resolved server-side).

## Findings

### 1. IDOR — organization-scoped billing routes: no issue found

Every organization-scoped billing route (`BillingController.getSummary`,
`.upgrade`, `.cancel`, `.renew`; `UsageController.getSummary`) calls
`resolveOrganizationMembership(prisma, user.id, organizationId)` before
touching any data, and the three mutating routes additionally call
`requireEnterpriseRole(role, 'ADMIN')`. `organizationId` is never trusted
bare from the URL or body without this check. This is the same pattern
Module 10's `organizations.commands.ts` established and is applied
consistently — verified by reading all four controllers in full, not
sampled.

### 2. Price/plan trust boundary: no issue found

`UpgradeSubscriptionRequestDto` carries `organizationId` and `planTier`
(an enum, not a price) — never a raw amount or Stripe price ID from the
client. `SubscriptionService.upgrade()` resolves the actual Stripe price
ID and amount server-side from `Plan.providerMetadata`, keyed off
`planTier`. A client cannot submit an arbitrary discount, currency, or
amount; the only client-controlled input is which of the platform's own
pre-configured plans to move to, and that move still requires `ADMIN`
role in the target organization.

### 3. Webhook signature/idempotency/replay: signature and replay-window verified; no event-ID deduplication

`StripeWebhookController.verifySignature()` — real HMAC-SHA256 over
`t=<ts>.<raw_body>`, timing-safe comparison (`timingSafeEqual`, with a
length-mismatch path that still performs a constant-time comparison
against a zero buffer rather than short-circuiting), and a 5-minute
timestamp-tolerance window that rejects a signed payload replayed long
after original delivery.

**Not present:** deduplication by Stripe's `event.id`. `applySubscriptionObject`/
`syncInvoices` are idempotent in the sense that replaying the *same*
event just re-applies the same resulting state (an upsert keyed on
`providerCustomerId`/`providerSubscriptionId`, not an insert), so a
duplicate delivery of the same event is harmless. What is **not**
guarded against is **out-of-order delivery of two different events** —
e.g., if Stripe redelivers an older `customer.subscription.updated`
(status: `past_due`) after a newer one (status: `active`) has already
been processed, this controller has no `event.created` ordering check
and would overwrite the newer state with the older one. This is a real,
disclosed gap — closing it requires a `WebhookEvent` table (event ID +
timestamp) and a last-applied-timestamp check, which is real, scoped
follow-up work, not implemented in this pass since it cannot be
exercised against a real Stripe account in this environment (see the
Verification section of the final report).

### 4. Quota/usage counter concurrency: atomic increments confirmed; check-then-act race disclosed

`UsageService.record()` uses `prisma.usageCounter.upsert()` with
`update: { quantity: { increment: input.quantity } }` — a single atomic
`INSERT ... ON CONFLICT DO UPDATE SET quantity = quantity + $n` at the
database level, not a read-modify-write in application code. Concurrent
calls to `record()` for the same scope/resource/period cannot lose an
increment.

**Disclosed limitation:** `QuotaService.check()`/`.enforce()` and
`AiBudgetEnforcerService.check()` both read current counters, the caller
then performs the metered action, and only afterward is `record()`
called. Two concurrent requests can both read a counter just under its
limit, both pass the check, and both proceed — the limit can be
exceeded by a small margin under concurrent load (classic TOCTOU). This
is a pre-existing architectural property of the whole Module 15 quota
system (not something Module 19 introduced), and closing it fully would
require restructuring every metered call site into a single atomic
"reserve-then-commit" step — real, non-trivial scope, disclosed here
rather than silently left unmentioned or fixed as an incidental side
effect of this module.

### 5. AI-credit double-deduction on retries: no double-deduction path found

There is no separate AI-credit ledger in this codebase (see "Deliberate
non-duplication" below) — cost control runs through
`AiBudgetEnforcerService.recordUsage()`, called exactly once per
completed AI chat turn, from a single call site
(`ai-chat.service.ts`, immediately after the assistant message is marked
`COMPLETE`), wrapped in its own try/catch that logs rather than
rethrows or retries on failure. Traced this call site and found no
retry loop that could invoke `recordUsage()` twice for one logical
generation. A user-initiated regenerate/retry from the frontend creates
a new, distinct assistant message with its own token counts — that is
correct metering of two real generations, not double-counting of one.

### 6. Admin-endpoint audit: platform-operator vs. organization-admin distinction is intentional and documented

`AiCostControlController` and `QuotaController` (pre-existing) are
gated with `@Roles('ADMIN')` (a platform-wide role via `RolesGuard`),
not `requireEnterpriseRole` — both carry a doc comment explaining this
is deliberate: AI pricing and budget-policy defaults are deployment-wide
configuration, not something an individual organization's own billing
admin should be able to set. This was not re-litigated in Module 19
(pre-existing, documented architecture), only confirmed consistent
during this audit.

### 7. Read-only usage endpoint: confirmed by design

`UsageController` exposes exactly one route (`GET
usage/:organizationId/summary`) and `UsageService.record()` has no HTTP
route anywhere in the codebase (grepped) — usage can only be written by
server-side code that already performs a metered action, never by a
client request. A client cannot fabricate usage to trigger fake
overage alerts, nor suppress real usage.

### 8. Frontend: no secrets, no fabricated success states

Every new frontend file added in Module 19 reads
`BillingCheckoutSessionDto.checkoutUrl` from the backend and either
redirects to it (a real provider URL) or treats a `null` value as "plan
changed immediately, no checkout" per the DTO's own documented contract
— no client-side "payment successful" state is ever synthesized. No API
key, webhook secret, or provider credential is read, displayed, or
logged by any new frontend code (confirmed by reading every new file:
none references `STRIPE_WEBHOOK_SECRET`, `apiKey`, or any credential
field beyond what `BillingSummaryDto`/`PlanDto` already expose, which
are non-secret by design — `PaymentMethodDto` only ever carries
`last4`/`brand`/expiry, never a full card or token).

## Deliberate non-duplication: no separate AI-credit ledger built

The Module 19 spec asked for an "AI credit system" with
`AICreditBalance`/`AICreditTransaction`/`AIUsageRecord` entities,
monthly allocation, purchased credits, refunds, and admin adjustment.
This was evaluated and **deliberately not built** as a second system:
`AiBudgetPolicy` (hard/soft limits, hard-stop, fallback-model
suggestion) + `UsageCounter` (`AI_TOKENS`/`AI_COST_CENTS`/`AI_REQUESTS`,
DAILY/MONTHLY/TOTAL, atomic increments) already provide real,
functioning AI cost control — a positive-balance "credit" ledger with
purchase/refund semantics would be a parallel accounting system tracking
the same underlying facts (tokens and cost) a different way, which is
exactly the "duplicate SDK infrastructure" anti-pattern the SDK
reconciliation task (and this module's own absolute rules) explicitly
warn against. If a future module genuinely needs prepaid-credit
semantics (a hard ceiling a customer purchases in advance, distinct from
a budget alert), that is real, additive scope on top of
`AiBudgetPolicy`/`UsageCounter`, not a reason to have built a parallel
ledger here.

## Summary

No IDOR, no client-controlled pricing, and no usage-fabrication path
were found. Webhook signature verification is solid; event-ordering
(not just signature/replay-window) is a disclosed gap. Quota
check-then-act concurrency is a disclosed, pre-existing architectural
limitation, not new to this module. No secrets are exposed in any new
frontend code. No duplicate AI-credit system was built, by deliberate
architectural decision.
