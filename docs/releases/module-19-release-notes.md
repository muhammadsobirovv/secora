# Module 19 Release Notes — Product Completion, Monetization & Launch Readiness

## Scope

Module 19 was scoped as "baseline audit first, implement only real
gaps" — not a rebuild of monetization. The audit found that Module 15
already shipped a production-quality billing/subscription/quota/usage/
AI-cost backend; the actual remaining gap was that none of it had a
frontend. This module closes that gap, reconciles nine historical
backlog tickets, fixes two small real defects found along the way, and
runs a dedicated security review of the monetization surface.

## What already existed (verified, not rebuilt)

`Plan`/`Subscription`/`Invoice`/`PaymentMethod`/`UsageCounter`/
`QuotaPolicy`/`FeatureFlag`/`AiModelPricing`/`AiBudgetPolicy` (Prisma
schema); `BillingService`/`SubscriptionService`/`InvoiceService`/
`QuotaService`/`UsageService`/`EntitlementService`/
`AiBudgetEnforcerService`/`AiModelPricingService`; a provider-neutral
`PaymentProvider` interface with Stripe/Manual/Null adapters; a real,
HMAC-signature-verified Stripe webhook controller
(`StripeWebhookController`); IDOR-safe organization-scoped billing
routes (`resolveOrganizationMembership` + `requireEnterpriseRole`); a
read-only usage endpoint (`UsageService.record()` has no HTTP route at
all — usage can only be written by server-side code performing a
metered action).

## What was built this module

**Frontend billing/organization surface** — `apps/web/lib/api/organizations.ts`
(the frontend previously had no way to resolve the current user's
`organizationId` at all), `apps/web/lib/api/billing.ts`,
`features/organizations/hooks/use-organizations.ts`,
`features/billing/hooks/use-billing.ts`, and three pages:

- `/pricing` — plan comparison, real Stripe hosted-checkout redirect
  when a plan has `providerMetadata` configured, immediate plan switch
  for `NONE`/`MANUAL` providers, "Contact us" for plans without a
  checkout path. Lives inside the authenticated dashboard, not as a
  public marketing page — this app has no public/unauthenticated
  marketing surface today (only `/docs` is), and `GET billing/plans`
  itself sits behind the global auth guard. A logged-out pricing page is
  real, disclosed follow-up scope.
- `/settings/billing` — plan/status/period, payment methods, invoices
  (capped at 50, most recent first — see Performance below), cancel/
  undo-cancel actions, all gated by real membership + `ADMIN` role
  checks on the backend, not just hidden in the UI.
- `/settings/usage` — backend-authoritative usage bars from
  `QuotaService.getPlanUsageSummary()`.

Every page handles: no organization yet (the common Community Edition/
self-hosted case — Billing/Subscription/Invoice are keyed on
`organizationId`, not `workspaceId`, so a Workspace with no Organization
above it has nothing to show, by design, not by omission), loading,
error, and provider-not-configured states honestly. No fake payment
success screen exists anywhere — the only "success" a page shows is a
real `checkoutUrl` redirect or an immediate, real plan change.

## Historical backlog reconciliation

Full per-item detail in `docs/reviews/0022-module-19-backlog-reconciliation.md`.
Highlights: #132 and #436 were tracker-bookkeeping gaps (real work
existed under different ticket numbers, never flipped) — fixed. #381,
#383, #384, #385, #388, #389 were already complete and are now marked
so. #382's backend half was real but shipped with a broken frontend
dependency — found via a real `tsc --noEmit -p tsconfig.json` run and
fixed. #386/#387 are the one genuinely ambiguous case: the ticket
numbers were reused by a later task (#425, Public Sharing) for
different, real, shipped work — the originally-titled features
(research-analytics-dashboard extensions, a distinct security research
notebook) were never built and aren't currently planned. Recorded as
OBSOLETE, not silently marked done. #396 (security news feed) is
confirmed missing beyond env-var scaffolding — its own title marks it
optional, left as deferred scope. #212/#213 (apps/api jest, boot+health)
remain VERIFICATION_BLOCKED — see Verification below.

## Two small defects found and fixed

- `packages/shared/src/billing-endpoints.ts`: every path constant was
  missing its leading `/` (e.g. `"billing/plans"` instead of
  `"/billing/plans"`), unlike every other `*-endpoints.ts` file in the
  package. `apiFetch()` concatenates `${API_BASE_URL}${path}`, so this
  would have produced a malformed URL immediately. Zero frontend
  consumers existed before this module, so it never broke a real
  request — caught while building the first one.
- `apps/web/features/bugbounty/components/bugbounty-badges.tsx`: its
  `BugBountyFindingStage`/`ScopeClassification` `Record`s were missing
  keys for states Module 16 (`DRAFT`/`INFORMATIVE`/`ACCEPTED`/`REJECTED`)
  and Module 9 (`REVIEW_NEEDED`/`DEPRECATED`) had already added to the
  underlying types — a genuine `apps/web` typecheck failure (TS2739),
  unrelated to this module, found via a real compiler run.

## Performance (#408 — targeted, not a Module 18 repeat)

`InvoiceService.listInvoices()` had no `take` limit — capped at 50
(most-recent-first, already the query's sort order). No broader
Module-16-wide performance sweep was attempted; that scope is
independent of monetization and would duplicate Module 18's already-
completed dedicated performance pass.

## Security

Dedicated review in `docs/reviews/0023-module-19-monetization-security-review.md`.
No IDOR, no client-controlled pricing/plan/amount, no usage-fabrication
path, no secrets in any new frontend code. Webhook signature + replay-
window verification confirmed solid; webhook event **ordering** (not
signature/replay) is a disclosed, unfixed gap — a duplicate delivery of
the same event is harmless, but an out-of-order redelivery of two
*different* events could overwrite newer state with older. Quota
counters use atomic DB-level increments (confirmed race-safe for
concurrent writes), but the broader check-then-act quota-enforcement
flow has a pre-existing (not introduced here) TOCTOU race under
concurrent load. No separate AI-credit ledger was built — a deliberate
decision, not an oversight; `AiBudgetPolicy` + `UsageCounter` already
provide real cost control, and a parallel credit-balance system would
duplicate the same underlying facts a different way.

## Verification

- `packages/shared` `tsc` build — **PASS**.
- New `apps/web` files — `tsc --noEmit --noResolve` (structural/syntax
  check, skips module resolution) — **PASS**, zero non-module errors.
- A real `tsc --noEmit -p tsconfig.json` run (using the partial
  `node_modules` already present) surfaced and confirmed the
  `bugbounty-badges.tsx` defect above.
- `apps/api` jest (#212) and a real boot/health-check attempt (#213) —
  **VERIFICATION_BLOCKED**. Three genuine `pnpm install` attempts were
  made (full monorepo: 1554 packages; `--filter web...`: 586 packages;
  `--filter api...`: 1138 packages), each capped at the tool's ~170s
  per-call ceiling. Registry connectivity is confirmed working
  (`registry.npmjs.org` returns 200), but effective download+extract
  throughput measured at roughly one package per 10-15 seconds — far
  too slow to complete a 500-1500-package graph in this session. A
  background/detached install (`nohup ... &`) does not persist across
  separate tool calls in this environment (confirmed: the log file it
  wrote to was empty, and `node_modules` had not grown, at the start of
  the next call).

## Known gaps carried forward

- No public/logged-out `/pricing` page (this app has no
  unauthenticated marketing surface at all today).
- No org-switcher UI — `usePrimaryOrganization()` picks the first
  organization returned by `GET /enterprise/organizations`; a user
  belonging to more than one organization cannot switch between them
  from the Billing UI yet.
- Webhook event ordering (not signature/replay) is unguarded — no
  `WebhookEvent` dedup/ordering table exists yet.
- Quota check-then-act concurrency race (pre-existing, Module 15).
- `apps/api` jest / boot+health verification remains environment-blocked.
- Security news feed (#396) remains unbuilt beyond env-var scaffolding.

See `PROJECT_SPEC.md`'s Module 19 paragraph,
`docs/reviews/0022-module-19-backlog-reconciliation.md`, and
`docs/reviews/0023-module-19-monetization-security-review.md` for full
detail.
