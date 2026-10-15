// Module 15 — default plan seed data. Consumed by
// `apps/api/prisma/seed-plans.ts` to populate the `Plan` table on first
// boot, and by `EntitlementService` as an in-memory fallback if the `Plan`
// table hasn't been seeded yet (never hard-fails a fresh install waiting on
// a seed script to run). These are illustrative starting values, not
// commercial pricing decisions — every number here is a config value an
// operator is expected to tune via the `Plan` table, not a hardcoded
// business rule (see docs/adr/0015-... §"Configuration-driven plans").
import type { PlanDto, PlanLimitEntry, PlanTier } from "./billing.js";

const UNLIMITED: PlanLimitEntry = { daily: null, monthly: null, total: null };

export interface PlanSeedDefinition
  extends Omit<PlanDto, "id" | "providerMetadata"> {}

export const DEFAULT_PLAN_SEEDS: Record<PlanTier, PlanSeedDefinition> = {
  FREE: {
    tier: "FREE",
    name: "Community",
    description:
      "Unlimited self-hosted usage — local database, local storage, local AI (Ollama/local models), local scanners, the Desktop Agent, the mobile app, MCP, plugins, and workflows. Never charged for self-hosted usage.",
    priceMonthlyCents: 0,
    priceYearlyCents: 0,
    currency: "usd",
    isActive: true,
    limits: {
      AI_TOKENS: UNLIMITED,
      AI_REQUESTS: UNLIMITED,
      SCANNER_JOBS: UNLIMITED,
      RECON_JOBS: UNLIMITED,
      WORKER_CPU_SECONDS: UNLIMITED,
      STORAGE_BYTES: UNLIMITED,
      BANDWIDTH_BYTES: UNLIMITED,
      REPORTS_GENERATED: UNLIMITED,
      WORKFLOW_EXECUTIONS: UNLIMITED,
      MCP_CALLS: UNLIMITED,
      API_REQUESTS: UNLIMITED,
      PLUGIN_EXECUTIONS: UNLIMITED,
      DESKTOP_JOBS: UNLIMITED,
      MOBILE_SYNCS: UNLIMITED,
    },
    features: {
      hostedWorkers: false,
      sso: false,
      scim: false,
      dedicatedWorkers: false,
      sla: false,
      customDomain: false,
      auditRetentionDays: 30,
      prioritySupport: false,
    },
  },
  CLOUD_FREE: {
    tier: "CLOUD_FREE",
    name: "Cloud Free",
    description: "A hosted trial tier with limited resources — for trying Secora Cloud before upgrading.",
    priceMonthlyCents: 0,
    priceYearlyCents: 0,
    currency: "usd",
    isActive: true,
    limits: {
      AI_TOKENS: { monthly: 200_000 },
      AI_REQUESTS: { daily: 50, monthly: 500 },
      STORAGE_BYTES: { total: 1_073_741_824 }, // 1 GiB
      WORKER_CPU_SECONDS: { monthly: 3_600 }, // 1 hour
      SCANNER_JOBS: { monthly: 20 },
      RECON_JOBS: { monthly: 20 },
      REPORTS_GENERATED: { monthly: 10 },
      WORKFLOW_EXECUTIONS: { monthly: 50 },
      API_REQUESTS: { daily: 1_000 },
    },
    features: {
      hostedWorkers: true,
      sso: false,
      scim: false,
      dedicatedWorkers: false,
      sla: false,
      customDomain: false,
      auditRetentionDays: 30,
      prioritySupport: false,
    },
  },
  PRO: {
    tier: "PRO",
    name: "Pro",
    description: "Higher limits, hosted workers, larger storage, premium AI integrations, priority jobs.",
    priceMonthlyCents: 4_900,
    priceYearlyCents: 49_000,
    currency: "usd",
    isActive: true,
    limits: {
      AI_TOKENS: { monthly: 5_000_000 },
      AI_REQUESTS: { daily: 2_000, monthly: 20_000 },
      STORAGE_BYTES: { total: 53_687_091_200 }, // 50 GiB
      WORKER_CPU_SECONDS: { monthly: 108_000 }, // 30 hours
      SCANNER_JOBS: { monthly: 500 },
      RECON_JOBS: { monthly: 500 },
      REPORTS_GENERATED: { monthly: 200 },
      WORKFLOW_EXECUTIONS: { monthly: 2_000 },
      API_REQUESTS: { daily: 50_000 },
    },
    features: {
      hostedWorkers: true,
      priorityJobs: true,
      premiumAiIntegrations: true,
      advancedAutomation: true,
      sso: false,
      scim: false,
      dedicatedWorkers: false,
      sla: false,
      customDomain: false,
      auditRetentionDays: 90,
      prioritySupport: false,
    },
  },
  TEAM: {
    tier: "TEAM",
    name: "Team",
    description: "Everything in Pro, plus team collaboration, advanced RBAC, shared projects, team analytics.",
    priceMonthlyCents: 14_900,
    priceYearlyCents: 149_000,
    currency: "usd",
    isActive: true,
    limits: {
      AI_TOKENS: { monthly: 20_000_000 },
      AI_REQUESTS: { daily: 10_000, monthly: 100_000 },
      STORAGE_BYTES: { total: 214_748_364_800 }, // 200 GiB
      WORKER_CPU_SECONDS: { monthly: 432_000 }, // 120 hours
      SCANNER_JOBS: { monthly: 2_000 },
      RECON_JOBS: { monthly: 2_000 },
      REPORTS_GENERATED: { monthly: 1_000 },
      WORKFLOW_EXECUTIONS: { monthly: 10_000 },
      API_REQUESTS: { daily: 200_000 },
    },
    features: {
      hostedWorkers: true,
      priorityJobs: true,
      premiumAiIntegrations: true,
      advancedAutomation: true,
      teamCollaboration: true,
      advancedRbac: true,
      teamAnalytics: true,
      sso: false,
      scim: false,
      dedicatedWorkers: false,
      sla: false,
      customDomain: false,
      auditRetentionDays: 180,
      prioritySupport: true,
    },
  },
  ENTERPRISE: {
    tier: "ENTERPRISE",
    name: "Enterprise",
    description: "SSO, SCIM, advanced ABAC, extended audit retention, dedicated workers, SLA, private deployment, custom domain, enterprise support.",
    priceMonthlyCents: 0, // Contact sales — negotiated per contract (BillingProviderKind.MANUAL).
    priceYearlyCents: 0,
    currency: "usd",
    isActive: true,
    limits: {
      AI_TOKENS: UNLIMITED,
      AI_REQUESTS: UNLIMITED,
      STORAGE_BYTES: UNLIMITED,
      WORKER_CPU_SECONDS: UNLIMITED,
      SCANNER_JOBS: UNLIMITED,
      RECON_JOBS: UNLIMITED,
      REPORTS_GENERATED: UNLIMITED,
      WORKFLOW_EXECUTIONS: UNLIMITED,
      API_REQUESTS: UNLIMITED,
    },
    features: {
      hostedWorkers: true,
      priorityJobs: true,
      premiumAiIntegrations: true,
      advancedAutomation: true,
      teamCollaboration: true,
      advancedRbac: true,
      teamAnalytics: true,
      sso: true,
      scim: true,
      advancedAbac: true,
      dedicatedWorkers: true,
      sla: true,
      customDomain: true,
      privateDeployment: true,
      auditRetentionDays: 730,
      prioritySupport: true,
    },
  },
};
