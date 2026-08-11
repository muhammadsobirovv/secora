-- Module 14: Cloud Platform, Enterprise SaaS, High Availability & Global Infrastructure
-- Additive only — new columns on "organizations"/"backup_policies" (all
-- nullable or defaulted, so every existing row stays valid with zero
-- data backfill) plus three new standalone tables. No column dropped, no
-- existing table renamed.

-- AlterTable: organizations — Tenant Management (Enterprise Edition only)
ALTER TABLE "organizations" ADD COLUMN "billingEmail" TEXT;
ALTER TABLE "organizations" ADD COLUMN "billingProviderCustomerId" TEXT;
ALTER TABLE "organizations" ADD COLUMN "subscriptionStatus" TEXT DEFAULT 'none';
ALTER TABLE "organizations" ADD COLUMN "subscriptionRenewsAt" TIMESTAMP(3);
ALTER TABLE "organizations" ADD COLUMN "customDomain" TEXT;
ALTER TABLE "organizations" ADD COLUMN "customDomainVerifiedAt" TIMESTAMP(3);
ALTER TABLE "organizations" ADD COLUMN "brandingPrimaryColor" TEXT;
ALTER TABLE "organizations" ADD COLUMN "brandingFaviconUrl" TEXT;

-- CreateEnum
CREATE TYPE "BackupScope" AS ENUM ('DATABASE', 'STORAGE', 'CONFIGURATION', 'FULL');
CREATE TYPE "BackupRunStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');
CREATE TYPE "BackupTrigger" AS ENUM ('SCHEDULED', 'MANUAL');
CREATE TYPE "LicenseEdition" AS ENUM ('COMMUNITY', 'ENTERPRISE');
CREATE TYPE "LicenseStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');

-- AlterTable: backup_policies — Backup System
ALTER TABLE "backup_policies" ADD COLUMN "scope" "BackupScope" NOT NULL DEFAULT 'FULL';
ALTER TABLE "backup_policies" ADD COLUMN "encrypt" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "backup_policies" ADD COLUMN "lastPrunedAt" TIMESTAMP(3);

-- CreateTable: backup_runs
CREATE TABLE "backup_runs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "backupPolicyId" TEXT,
    "scope" "BackupScope" NOT NULL DEFAULT 'FULL',
    "trigger" "BackupTrigger" NOT NULL DEFAULT 'SCHEDULED',
    "status" "BackupRunStatus" NOT NULL DEFAULT 'PENDING',
    "storageKey" TEXT,
    "sizeBytes" INTEGER,
    "checksumSha256" TEXT,
    "encrypted" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "backup_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "backup_runs_organizationId_startedAt_idx" ON "backup_runs"("organizationId", "startedAt");
CREATE INDEX "backup_runs_status_idx" ON "backup_runs"("status");

ALTER TABLE "backup_runs" ADD CONSTRAINT "backup_runs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "backup_runs" ADD CONSTRAINT "backup_runs_backupPolicyId_fkey" FOREIGN KEY ("backupPolicyId") REFERENCES "backup_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: licenses
CREATE TABLE "licenses" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "edition" "LicenseEdition" NOT NULL DEFAULT 'ENTERPRISE',
    "licenseKeyHash" TEXT NOT NULL,
    "issuedTo" TEXT NOT NULL,
    "seats" INTEGER,
    "status" "LicenseStatus" NOT NULL DEFAULT 'ACTIVE',
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "licenses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "licenses_licenseKeyHash_key" ON "licenses"("licenseKeyHash");
CREATE INDEX "licenses_status_idx" ON "licenses"("status");

ALTER TABLE "licenses" ADD CONSTRAINT "licenses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
