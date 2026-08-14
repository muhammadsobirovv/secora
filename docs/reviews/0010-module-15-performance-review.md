# Module 15 Performance Review

Follow-up to `0004-final-performance-review.md` and
`0006-module-14-performance-review.md`, scoped to what Module 15 added.
Same posture as both prior reviews: static code analysis only — this
sandbox has never had a running instance of the application to load-test
against (and, as of task #366, cannot even complete a full `tsc` pass —
see that task's disclosure), so every finding below is read from source,
not measured.

## 1. `QuotaService.resolveLimit()` — N+1 fixed during this pass

`QuotaService.check()` is documented as "the enforcement entry point
every resource-consuming command handler is expected to call" — a hot
path by design. `resolveLimit()` was originally a sequential loop
issuing one `quotaPolicy.findFirst` per candidate scope (USER, then
WORKSPACE, then ORGANIZATION — up to 3 round-trips), plus a 4th query for
the plan-tier fallback and a 5th for the usage counter itself in
`check()`. Rewritten to a single `findMany` with an `OR` across every
candidate `(scopeType, scopeId)` pair, with the most-specific match
picked in memory — same result, at most one query instead of up to
three. `QuotaPolicy` already carries `@@index([scopeType, scopeId])`
(task #325), which supports this query well without a further migration
change. See `apps/api/src/modules/billing/quota.service.ts`.

## 2. `UsageService.record()` — fan-out, not a loop, correct as written

Three `usageCounter.upsert()` calls (DAILY/MONTHLY/TOTAL) via
`Promise.all` — a fixed, bounded fan-out (always exactly 3, never
proportional to any table's size), not a loop over data. **No finding.**

## 3. `FeatureFlagsService.evaluateAll()` — acceptable for expected table size

One `findAll()` over every `FeatureFlag` row plus one `findOverridesForScopes()`
call per evaluation. Feature-flag tables are operator-curated and stay
small (tens, not millions, of rows) in every real-world deployment of
this pattern — no pagination or caching was added, and none is warranted
at this table's expected cardinality. Flagging for future awareness only:
if a deployment ever accumulates thousands of flags (unlikely), this
endpoint's cost would grow linearly with total flag count, not active
flag count.

## 4. `StripeWebhookController` / `SubscriptionService.applyStripeWebhookUpdate()` — no new query concerns

Single lookups by indexed unique/foreign-key columns
(`providerCustomerId`, `id`) per webhook event; `resolvePlanTierByStripePriceId()`
does a `plan.findMany()` (unindexed scan) but the `Plan` table is
operator-configured and expected to hold single-digit-to-low-tens of
rows, the same "small, curated table" reasoning as finding #3. **No
finding.**

## 5. `InvoiceService.sync()` — pre-existing (task #331), re-confirmed in scope

Loops over the provider's returned invoice list doing one
`invoice.upsert()` per invoice — bounded by a single customer's invoice
history (`?limit=100` in `StripePaymentProvider.listInvoices()`), not
unbounded. Re-reviewed as part of this pass since `StripeWebhookController`
(task #366) is a new caller of this method; no change needed.

## 6. Health/diagnostics endpoints — no regression

`GET /observability/health/diagnostics` (task #353) and the `channel`
field added to `GET /observability/health` (task #356) both add zero
query cost beyond what already existed (`channel` reads a `ConfigService`
value already loaded at boot; diagnostics' one `SELECT 1` was already
present before this task).

## Summary

One real fix made (`QuotaService.resolveLimit()`'s N+1 → 1 query), same
category and severity as Module 14's Plugin Marketplace fix. Everything
else added this module is either bounded fan-out, small-table scans that
don't warrant an index/cache, or unchanged pre-existing logic re-checked
because a new caller was added. Consistent with the prior reviews'
headline: nothing pathological found, nothing load-tested — a static
read, not a benchmark result.
