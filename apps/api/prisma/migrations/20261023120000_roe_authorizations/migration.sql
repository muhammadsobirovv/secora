-- Client engagement (rules of engagement) authorizations.
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'ROE_REQUESTED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'ROE_EMAIL_SENT';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'ROE_APPROVED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'ROE_DECLINED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'ROE_REVOKED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'ROE_CANCELLED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'ROE_SCAN_AUTHORIZED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'ROE_SCAN_STOPPED';

CREATE TYPE "RoeStatus" AS ENUM ('PENDING', 'ACTIVE', 'DECLINED', 'EXPIRED', 'REVOKED', 'CANCELLED');

CREATE TABLE "roe_authorizations" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "clientEmail" TEXT NOT NULL,
    "clientEmailDomain" TEXT NOT NULL,
    "signatoryName" TEXT NOT NULL,
    "signatoryRole" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "status" "RoeStatus" NOT NULL DEFAULT 'PENDING',
    "tokenHash" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "tokenUsedAt" TIMESTAMP(3),
    "revokeTokenHash" TEXT,
    "evidenceKey" TEXT,
    "evidenceName" TEXT,
    "evidenceMime" TEXT,
    "evidenceSize" INTEGER,
    "evidenceSha256" TEXT,
    "responsibilityAcceptedAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "approvedIp" TEXT,
    "approvedUserAgent" TEXT,
    "declinedAt" TIMESTAMP(3),
    "declinedIp" TEXT,
    "declinedUserAgent" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedIp" TEXT,
    "revokedUserAgent" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "lastEmailAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roe_authorizations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "roe_assets" (
    "id" TEXT NOT NULL,
    "authorizationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "wildcard" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "roe_assets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "roe_email_events" (
    "id" TEXT NOT NULL,
    "authorizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roe_email_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "roe_authorizations_tokenHash_key" ON "roe_authorizations"("tokenHash");
CREATE UNIQUE INDEX "roe_authorizations_revokeTokenHash_key" ON "roe_authorizations"("revokeTokenHash");
CREATE INDEX "roe_authorizations_workspaceId_status_idx" ON "roe_authorizations"("workspaceId", "status");
CREATE INDEX "roe_authorizations_requestedBy_status_idx" ON "roe_authorizations"("requestedBy", "status");
CREATE INDEX "roe_assets_authorizationId_idx" ON "roe_assets"("authorizationId");
CREATE INDEX "roe_assets_host_idx" ON "roe_assets"("host");
CREATE INDEX "roe_email_events_userId_createdAt_idx" ON "roe_email_events"("userId", "createdAt");
CREATE INDEX "roe_email_events_recipient_createdAt_idx" ON "roe_email_events"("recipient", "createdAt");

ALTER TABLE "roe_assets" ADD CONSTRAINT "roe_assets_authorizationId_fkey" FOREIGN KEY ("authorizationId") REFERENCES "roe_authorizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "roe_email_events" ADD CONSTRAINT "roe_email_events_authorizationId_fkey" FOREIGN KEY ("authorizationId") REFERENCES "roe_authorizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
