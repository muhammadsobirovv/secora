-- CreateEnum
CREATE TYPE "TargetAuthorizationBasis" AS ENUM ('OWNER', 'WRITTEN_PERMISSION', 'BUG_BOUNTY_SCOPE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditEventType" ADD VALUE 'TARGET_AUTHORIZATION_ATTESTED';
ALTER TYPE "AuditEventType" ADD VALUE 'SCAN_STARTED';
ALTER TYPE "AuditEventType" ADD VALUE 'ACTIVE_SCAN_BLOCKED';

-- CreateTable
CREATE TABLE "target_authorizations" (
    "id" TEXT NOT NULL,
    "targetId" TEXT,
    "programId" TEXT,
    "workspaceId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "basis" "TargetAuthorizationBasis" NOT NULL,
    "documentReference" TEXT,
    "notes" TEXT,
    "attestationVersion" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "target_authorizations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "target_authorizations_targetId_createdAt_idx" ON "target_authorizations"("targetId", "createdAt");

-- CreateIndex
CREATE INDEX "target_authorizations_programId_createdAt_idx" ON "target_authorizations"("programId", "createdAt");

-- AddForeignKey
ALTER TABLE "target_authorizations" ADD CONSTRAINT "target_authorizations_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "targets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "target_authorizations" ADD CONSTRAINT "target_authorizations_programId_fkey" FOREIGN KEY ("programId") REFERENCES "bugbounty_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "target_authorizations" ADD CONSTRAINT "target_authorizations_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

