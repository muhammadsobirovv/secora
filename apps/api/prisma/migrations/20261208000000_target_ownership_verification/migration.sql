-- CreateEnum
CREATE TYPE "TargetOwnershipMethod" AS ENUM ('DNS_TXT', 'HTTP_FILE', 'META_TAG');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditEventType" ADD VALUE 'TARGET_OWNERSHIP_CHALLENGE_ISSUED';
ALTER TYPE "AuditEventType" ADD VALUE 'TARGET_OWNERSHIP_VERIFIED';
ALTER TYPE "AuditEventType" ADD VALUE 'TARGET_OWNERSHIP_CHECK_FAILED';
ALTER TYPE "AuditEventType" ADD VALUE 'TARGET_OWNERSHIP_BLOCKED';

-- CreateTable
CREATE TABLE "target_ownership_verifications" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "method" "TargetOwnershipMethod",
    "verifiedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "target_ownership_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "target_ownership_verifications_targetId_key" ON "target_ownership_verifications"("targetId");

-- AddForeignKey
ALTER TABLE "target_ownership_verifications" ADD CONSTRAINT "target_ownership_verifications_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "targets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

