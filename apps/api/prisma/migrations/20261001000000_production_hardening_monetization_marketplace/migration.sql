-- Module 15 — Production Hardening, Monetization, Marketplace & Global Launch
-- Consolidated migration (task #365). Hand-written against schema.prisma's
-- current state because `npx prisma generate`/`migrate dev` could not be run
-- in the authoring sandbox (the `prisma` CLI package is absent from the
-- local pnpm store — same category of gap disclosed for `jest` throughout
-- this module's tasks). This file was assembled by reading every
-- "Module 15" tagged block in schema.prisma directly, in the same spirit as
-- Module 13's disclosed precedent (see that migration's header comment).
--
-- REQUIRED BEFORE USE: run `npx prisma migrate diff --from-migrations
-- prisma/migrations --to-schema-datamodel prisma/schema.prisma --script`
-- (or `prisma migrate dev`) on a machine with a working `prisma` install to
-- verify this file matches the schema exactly before applying it to any
-- real database. Treat this as a strong best-effort draft, not a
-- Prisma-generated guarantee.

BEGIN;

-- ---------------------------------------------------------------------------
-- Scattered additive fields on pre-existing tables
-- ---------------------------------------------------------------------------

-- Demo mode (task #352)
ALTER TABLE "workspaces" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "workspaces" ADD COLUMN "demoExpiresAt" TIMESTAMP(3);

-- API key management improvements (task #336)
ALTER TABLE "api_keys" ADD COLUMN "ipAllowlist" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "api_keys" ADD COLUMN "rateLimitPerMinute" INTEGER;
ALTER TABLE "api_keys" ADD COLUMN "rotatedFromId" TEXT;

-- Privacy controls + first-run onboarding (tasks #342, #351)
ALTER TABLE "user_preferences" ADD COLUMN "telemetryOptOut" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_preferences" ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);

-- Local-first AI confirmation (task #341)
ALTER TABLE "workspace_ai_privacy_settings" ADD COLUMN "cloudUsageConfirmedAt" TIMESTAMP(3);

-- Marketplace security — publisher attribution on Plugin (task #333)
ALTER TABLE "plugins" ADD COLUMN "publisherId" TEXT;
CREATE INDEX "plugins_publisherId_idx" ON "plugins"("publisherId");

-- Marketplace security — version integrity + review status (task #333)
ALTER TABLE "plugin_versions" ADD COLUMN "checksumSha256" TEXT;
ALTER TABLE "plugin_versions" ADD COLUMN "reviewStatus" "MarketplaceReviewStatus" NOT NULL DEFAULT 'PENDING';

-- AuditEventType enum additions (tasks #342, #352, #355)
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'DATA_EXPORT_REQUESTED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'ACCOUNT_DELETION_REQUESTED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'DEMO_SESSION_STARTED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'SUPPORT_TICKET_CREATED';

-- BugBountyNotificationType enum addition (task #340)
ALTER TYPE "BugBountyNotificationType" ADD VALUE IF NOT EXISTS 'AI_BUDGET_ALERT';

-- ---------------------------------------------------------------------------
-- Billing (tasks #327-331): Plan, Subscription, Invoice, PaymentMethod
-- ---------------------------------------------------------------------------

CREATE TYPE "PlanTier" AS ENUM ('FREE', 'CLOUD_FREE', 'PRO', 'TEAM', 'ENTERPRISE');
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED', 'NONE');
CREATE TYPE "BillingProviderKind" AS ENUM ('STRIPE', 'MANUAL', 'NONE');
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE');

CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "tier" "PlanTier" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priceMonthlyCents" INTEGER NOT NULL DEFAULT 0,
    "priceYearlyCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "limits" JSONB NOT NULL,
    "features" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "providerMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "plans_tier_key" ON "plans"("tier");

CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'NONE',
    "provider" "BillingProviderKind" NOT NULL DEFAULT 'NONE',
    "providerCustomerId" TEXT,
    "providerSubscriptionId" TEXT,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "trialEndsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "subscriptions_organizationId_key" ON "subscriptions"("organizationId");
CREATE INDEX "subscriptions_provider_providerSubscriptionId_idx" ON "subscriptions"("provider", "providerSubscriptionId");
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "provider" "BillingProviderKind" NOT NULL,
    "providerInvoiceId" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "hostedInvoiceUrl" TEXT,
    "pdfUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "invoices_organizationId_issuedAt_idx" ON "invoices"("organizationId", "issuedAt");
CREATE INDEX "invoices_provider_providerInvoiceId_idx" ON "invoices"("provider", "providerInvoiceId");
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "payment_methods" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" "BillingProviderKind" NOT NULL,
    "providerPaymentMethodId" TEXT NOT NULL,
    "brand" TEXT,
    "last4" TEXT,
    "expMonth" INTEGER,
    "expYear" INTEGER,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "payment_methods_organizationId_idx" ON "payment_methods"("organizationId");
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Usage metering + quota engine (tasks #329-330)
-- ---------------------------------------------------------------------------

CREATE TYPE "UsageResourceType" AS ENUM ('AI_TOKENS', 'AI_REQUESTS', 'SCANNER_JOBS', 'RECON_JOBS', 'WORKER_CPU_SECONDS', 'STORAGE_BYTES', 'BANDWIDTH_BYTES', 'REPORTS_GENERATED', 'WORKFLOW_EXECUTIONS', 'MCP_CALLS', 'API_REQUESTS', 'PLUGIN_EXECUTIONS', 'DESKTOP_JOBS', 'MOBILE_SYNCS', 'AI_COST_CENTS');
CREATE TYPE "QuotaScopeType" AS ENUM ('PLAN', 'ORGANIZATION', 'WORKSPACE', 'USER');
CREATE TYPE "QuotaPeriodType" AS ENUM ('DAILY', 'MONTHLY', 'TOTAL');

CREATE TABLE "usage_counters" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT '',
    "workspaceId" TEXT NOT NULL DEFAULT '',
    "userId" TEXT NOT NULL DEFAULT '',
    "resourceType" "UsageResourceType" NOT NULL,
    "periodType" "QuotaPeriodType" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "usage_counters_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "usage_counters_organizationId_workspaceId_userId_resource_key" ON "usage_counters"("organizationId", "workspaceId", "userId", "resourceType", "periodType", "periodStart");
CREATE INDEX "usage_counters_organizationId_resourceType_periodStart_idx" ON "usage_counters"("organizationId", "resourceType", "periodStart");

CREATE TABLE "quota_policies" (
    "id" TEXT NOT NULL,
    "scopeType" "QuotaScopeType" NOT NULL,
    "scopeId" TEXT,
    "planTier" "PlanTier",
    "resourceType" "UsageResourceType" NOT NULL,
    "periodType" "QuotaPeriodType" NOT NULL,
    "softLimit" DOUBLE PRECISION,
    "hardLimit" DOUBLE PRECISION,
    "graceHours" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "quota_policies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "quota_policies_scopeType_scopeId_planTier_resourceType_pe_key" ON "quota_policies"("scopeType", "scopeId", "planTier", "resourceType", "periodType");
CREATE INDEX "quota_policies_scopeType_scopeId_idx" ON "quota_policies"("scopeType", "scopeId");

-- ---------------------------------------------------------------------------
-- Marketplace security (task #333)
-- ---------------------------------------------------------------------------

CREATE TYPE "MarketplaceReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'FLAGGED');

CREATE TABLE "marketplace_publishers" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT,
    "displayName" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "publicKeyPem" TEXT,
    "websiteUrl" TEXT,
    "supportEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "marketplace_publishers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "marketplace_publishers_userId_key" ON "marketplace_publishers"("userId");
ALTER TABLE "marketplace_publishers" ADD CONSTRAINT "marketplace_publishers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "plugins" ADD CONSTRAINT "plugins_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "marketplace_publishers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "marketplace_scan_results" (
    "id" TEXT NOT NULL,
    "pluginVersionId" TEXT NOT NULL,
    "scanType" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "findings" JSONB,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "marketplace_scan_results_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "marketplace_scan_results_pluginVersionId_idx" ON "marketplace_scan_results"("pluginVersionId");
ALTER TABLE "marketplace_scan_results" ADD CONSTRAINT "marketplace_scan_results_pluginVersionId_fkey" FOREIGN KEY ("pluginVersionId") REFERENCES "plugin_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "security_advisories" (
    "id" TEXT NOT NULL,
    "pluginId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "VulnFindingSeverity" NOT NULL,
    "affectedVersionRange" TEXT,
    "patchedVersion" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "security_advisories_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "security_advisories_pluginId_idx" ON "security_advisories"("pluginId");
ALTER TABLE "security_advisories" ADD CONSTRAINT "security_advisories_pluginId_fkey" FOREIGN KEY ("pluginId") REFERENCES "plugins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "plugin_permission_grants" (
    "id" TEXT NOT NULL,
    "pluginInstallationId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "grantedByUserId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "plugin_permission_grants_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "plugin_permission_grants_pluginInstallationId_permission_key" ON "plugin_permission_grants"("pluginInstallationId", "permission");
ALTER TABLE "plugin_permission_grants" ADD CONSTRAINT "plugin_permission_grants_pluginInstallationId_fkey" FOREIGN KEY ("pluginInstallationId") REFERENCES "plugin_installations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Feature flags (task #357)
-- ---------------------------------------------------------------------------

CREATE TYPE "FeatureFlagScopeType" AS ENUM ('ORGANIZATION', 'WORKSPACE', 'USER');

CREATE TABLE "feature_flags" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "defaultEnabled" BOOLEAN NOT NULL DEFAULT false,
    "editionRules" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "feature_flags_key_key" ON "feature_flags"("key");

CREATE TABLE "feature_flag_overrides" (
    "id" TEXT NOT NULL,
    "featureFlagId" TEXT NOT NULL,
    "scopeType" "FeatureFlagScopeType" NOT NULL,
    "scopeId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feature_flag_overrides_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "feature_flag_overrides_featureFlagId_scopeType_scopeId_key" ON "feature_flag_overrides"("featureFlagId", "scopeType", "scopeId");
ALTER TABLE "feature_flag_overrides" ADD CONSTRAINT "feature_flag_overrides_featureFlagId_fkey" FOREIGN KEY ("featureFlagId") REFERENCES "feature_flags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- AI cost control (task #340)
-- ---------------------------------------------------------------------------

CREATE TABLE "ai_model_pricing" (
    "id" TEXT NOT NULL,
    "provider" "AiProviderName" NOT NULL,
    "model" TEXT NOT NULL,
    "inputCentsPerMillionTokens" INTEGER NOT NULL DEFAULT 0,
    "outputCentsPerMillionTokens" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ai_model_pricing_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ai_model_pricing_provider_model_key" ON "ai_model_pricing"("provider", "model");

CREATE TABLE "ai_budget_policies" (
    "id" TEXT NOT NULL,
    "scopeType" "QuotaScopeType" NOT NULL,
    "scopeId" TEXT,
    "planTier" "PlanTier",
    "dailyTokenLimit" INTEGER,
    "monthlyTokenLimit" INTEGER,
    "dailyCostCentsLimit" INTEGER,
    "monthlyCostCentsLimit" INTEGER,
    "hardStop" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ai_budget_policies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ai_budget_policies_scopeType_scopeId_planTier_key" ON "ai_budget_policies"("scopeType", "scopeId", "planTier");

-- ---------------------------------------------------------------------------
-- Support system (task #355)
-- ---------------------------------------------------------------------------

CREATE TYPE "SupportTicketCategory" AS ENUM ('BUG', 'BILLING', 'ACCOUNT', 'FEATURE_REQUEST', 'OTHER');
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "workspaceId" TEXT,
    "email" TEXT NOT NULL,
    "category" "SupportTicketCategory" NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "diagnosticsSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "support_tickets_userId_idx" ON "support_tickets"("userId");
CREATE INDEX "support_tickets_status_idx" ON "support_tickets"("status");

COMMIT;

-- ---------------------------------------------------------------------------
-- Post-migration data step (run separately, not part of this transaction):
-- seed the `plans` table (see apps/api/prisma/seed-plans.ts) so every
-- Organization's `ensureDefaultSubscription()` call has a PlanTier.FREE row
-- to attach to. Also backfill one `Subscription` row per existing
-- Organization pinned to FREE/NONE — SubscriptionService does this
-- lazily on first read if the seed step is skipped, so it is not strictly
-- required before deploying, only before every organization has a
-- `subscription` relation populated.
-- ---------------------------------------------------------------------------
