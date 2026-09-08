export const BILLING_ENDPOINTS = {
  summary: (organizationId: string) => `billing/${organizationId}/summary`,
  plans: () => "billing/plans",
  upgrade: () => "billing/upgrade",
  cancel: () => "billing/cancel",
  renew: (organizationId: string) => `billing/${organizationId}/renew`,
  /// Module 19 reconciliation note: `invoices`/`paymentMethods` below are
  /// not currently backed by their own controller routes —
  /// `BillingController` never grew dedicated list endpoints for either,
  /// since `BillingSummaryDto` (see `summary()` above) already inlines
  /// both `invoices` and `paymentMethods` in one response, which is what
  /// the actual frontend (`apps/web/lib/api/billing.ts`) reads from.
  /// Kept here rather than deleted (a real client could still be relying
  /// on these exported constants existing) but not to be treated as a
  /// live route until a controller actually implements one.
  invoices: (organizationId: string) => `billing/${organizationId}/invoices`,
  paymentMethods: (organizationId: string) => `billing/${organizationId}/payment-methods`,
  /// Provider-side webhook receiver — mirrors the existing Module 14
  /// `enterprise/billing/webhook` shared-secret pattern, kept as a
  /// separate path so a real Stripe webhook (signature-verified via
  /// `STRIPE_WEBHOOK_SECRET`) doesn't share a route with the generic
  /// manual-provider webhook `BillingWebhookController` already exposes.
  /// Module 19 reconciliation fix: this previously read
  /// `billing/webhooks/stripe` (plural "webhooks"), which did not match
  /// `StripeWebhookController`'s real `@Controller('billing/webhook')` +
  /// `@Post('stripe')` route (`billing/webhook/stripe`, singular). Not
  /// consumed by any in-repo code (grepped — this constant had zero
  /// callers), so the mismatch never broke a real request path; it would
  /// only have misled an operator who copied this constant's value
  /// directly into their Stripe Dashboard webhook URL configuration
  /// instead of using the real, documented route.
  stripeWebhook: () => "billing/webhook/stripe",
} as const;

export const USAGE_ENDPOINTS = {
  summary: (organizationId: string) => `usage/${organizationId}/summary`,
  workspaceSummary: (workspaceId: string) => `usage/workspace/${workspaceId}/summary`,
} as const;

export const QUOTA_ENDPOINTS = {
  policies: () => "quota/policies",
  policy: (id: string) => `quota/policies/${id}`,
} as const;

export const AI_COST_CONTROL_ENDPOINTS = {
  budgetPolicies: () => "ai-cost-control/budget-policies",
  budgetPolicy: (id: string) => `ai-cost-control/budget-policies/${id}`,
  estimate: () => "ai-cost-control/estimate",
} as const;
