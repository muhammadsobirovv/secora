-- Module 20 — Phase 7: webhook event-ordering fix (disclosed in Module 19's
-- monetization security review, 0023-module-19-monetization-security-review.md,
-- finding #3).
--
-- Pure additive migration: two new nullable columns on `subscriptions`.
-- No columns dropped, renamed, or made non-nullable; no data rewritten —
-- safe to apply without downtime on an existing database. `NULL` for
-- every existing row means "no ordering guard applied yet," which
-- `SubscriptionService.applyStripeWebhookUpdate()` treats as "always
-- accept" (a subscription created via checkout/manual flow, before its
-- first webhook) — exactly the correct, safe default.
ALTER TABLE "subscriptions" ADD COLUMN "lastWebhookEventId" TEXT;
ALTER TABLE "subscriptions" ADD COLUMN "lastWebhookEventAt" TIMESTAMP(3);
