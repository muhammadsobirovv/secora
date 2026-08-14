export const BILLING_ENDPOINTS = {
  summary: (organizationId: string) => `billing/${organizationId}/summary`,
  plans: () => "billing/plans",
  upgrade: () => "billing/upgrade",
  cancel: () => "billing/cancel",
  renew: (organizationId: string) => `billing/${organizationId}/renew`,
  invoices: (organizationId: string) => `billing/${organizationId}/invoices`,
  paymentMethods: (organizationId: string) => `billing/${organizationId}/payment-methods`,
  /// Provider-side webhook receiver — mirrors the existing Module 14
  /// `enterprise/billing/webhook` shared-secret pattern, kept as a
  /// separate path so a real Stripe webhook (signature-verified via
  /// `STRIPE_WEBHOOK_SECRET`) doesn't share a route with the generic
  /// manual-provider webhook `BillingWebhookController` already exposes.
  stripeWebhook: () => "billing/webhooks/stripe",
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
