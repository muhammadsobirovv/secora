// Module 19 — Product Completion, Monetization & Launch Readiness (#332).
//
// This is the first frontend consumer of `BILLING_ENDPOINTS`/`USAGE_ENDPOINTS`
// (packages/shared/src/billing-endpoints.ts) — Module 15 built the entire
// backend (BillingController/UsageController/SubscriptionService/
// QuotaService/EntitlementService) but never grew a frontend client, so
// `/billing`, `/pricing`, `/settings/billing`, and `/usage` had no data
// source. See `apps/web/lib/api/organizations.ts` for how the caller's
// `organizationId` is resolved first — every function here requires one.
import { BILLING_ENDPOINTS, USAGE_ENDPOINTS } from "@pentesthub/shared";
import type {
  BillingCheckoutSessionDto,
  BillingSummaryDto,
  CancelSubscriptionRequestDto,
  PlanDto,
  PlanUsageSummaryEntry,
  SubscriptionDto,
  UpgradeSubscriptionRequestDto,
} from "@pentesthub/shared";
import { apiFetch } from "./client";

export function listPlans() {
  return apiFetch<PlanDto[]>(BILLING_ENDPOINTS.plans());
}

export function getBillingSummary(organizationId: string) {
  return apiFetch<BillingSummaryDto>(BILLING_ENDPOINTS.summary(organizationId));
}

export function upgradePlan(data: UpgradeSubscriptionRequestDto) {
  return apiFetch<BillingCheckoutSessionDto>(BILLING_ENDPOINTS.upgrade(), { method: "POST", body: data });
}

export function cancelSubscription(data: CancelSubscriptionRequestDto) {
  return apiFetch<SubscriptionDto>(BILLING_ENDPOINTS.cancel(), { method: "POST", body: data });
}

export function renewSubscription(organizationId: string) {
  return apiFetch<SubscriptionDto>(BILLING_ENDPOINTS.renew(organizationId), { method: "POST" });
}

export function getUsageSummary(organizationId: string) {
  return apiFetch<PlanUsageSummaryEntry[]>(USAGE_ENDPOINTS.summary(organizationId));
}
