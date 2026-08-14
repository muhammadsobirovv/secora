// Module 15 — Usage metering + quota engine.
// See docs/adr/0015-production-hardening-monetization-marketplace.md.

/// Every resource `UsageService.record()` can meter. Self-hosted usage of
/// any of these is never billed — `QuotaEnforcer` only ever *warns or
/// blocks*, it never generates a charge; charging only happens through
/// `BillingService`/`Subscription`, and only for Cloud/Enterprise plans
/// with a real payment provider configured.
export const USAGE_RESOURCE_TYPES = [
  "AI_TOKENS",
  "AI_REQUESTS",
  "SCANNER_JOBS",
  "RECON_JOBS",
  "WORKER_CPU_SECONDS",
  "STORAGE_BYTES",
  "BANDWIDTH_BYTES",
  "REPORTS_GENERATED",
  "WORKFLOW_EXECUTIONS",
  "MCP_CALLS",
  "API_REQUESTS",
  "PLUGIN_EXECUTIONS",
  "DESKTOP_JOBS",
  "MOBILE_SYNCS",
  // Module 15 — AI cost control (task #340). Reuses the same
  // UsageCounter/UsageService machinery task #329 already built (DAILY/
  // MONTHLY/TOTAL upserts, quota-style reads) instead of a parallel cost
  // ledger table — AiBudgetEnforcer.recordUsage() records AI_TOKENS,
  // AI_REQUESTS, and this in the same call. Quantity is always whole
  // cents (never fractional), same "smallest common unit" convention
  // Invoice/Plan pricing already use elsewhere in this package.
  "AI_COST_CENTS",
] as const;
export type UsageResourceType = (typeof USAGE_RESOURCE_TYPES)[number];

export type QuotaScopeType = "PLAN" | "ORGANIZATION" | "WORKSPACE" | "USER";
export type QuotaPeriodType = "DAILY" | "MONTHLY" | "TOTAL";

export interface RecordUsageRequestDto {
  organizationId?: string;
  workspaceId?: string;
  userId?: string;
  resourceType: UsageResourceType;
  quantity: number;
  unit: string;
}

export interface UsageCounterDto {
  resourceType: UsageResourceType;
  periodType: QuotaPeriodType;
  periodStart: string;
  periodEnd: string;
  quantity: number;
  unit: string;
}

export interface QuotaPolicyDto {
  id: string;
  scopeType: QuotaScopeType;
  scopeId: string | null;
  planTier: string | null;
  resourceType: UsageResourceType;
  periodType: QuotaPeriodType;
  softLimit: number | null;
  hardLimit: number | null;
  graceHours: number;
}

export interface CreateQuotaPolicyRequestDto {
  scopeType: QuotaScopeType;
  scopeId?: string;
  planTier?: string;
  resourceType: UsageResourceType;
  periodType: QuotaPeriodType;
  softLimit?: number;
  hardLimit?: number;
  graceHours?: number;
}

/// `QuotaEnforcer.check()`'s return shape. `blocked: true` only ever
/// happens against a `hardLimit` (and only after `graceHours` has
/// elapsed since the soft limit was first crossed, if a soft limit
/// exists) — a `softLimit`-only breach always returns `blocked: false`
/// with `warning: true`, since soft limits are advisory by design (see
/// the `QuotaEnforcer` file's own doc comment for the full grace-period
/// state machine).
export interface QuotaCheckResultDto {
  allowed: boolean;
  blocked: boolean;
  warning: boolean;
  resourceType: UsageResourceType;
  currentQuantity: number;
  softLimit: number | null;
  hardLimit: number | null;
  /// The scope whose policy actually applied (most-specific-wins — see
  /// `QuotaPolicy`'s doc comment in schema.prisma).
  appliedScope: QuotaScopeType;
}
