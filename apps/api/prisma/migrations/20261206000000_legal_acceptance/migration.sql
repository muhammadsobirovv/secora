-- AlterEnum
ALTER TYPE "AuditEventType" ADD VALUE 'LEGAL_ACCEPTED';

-- CreateTable
CREATE TABLE "legal_acceptances" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "documents" TEXT[],
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,

    CONSTRAINT "legal_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "legal_acceptances_userId_acceptedAt_idx" ON "legal_acceptances"("userId", "acceptedAt");

-- CreateIndex
CREATE UNIQUE INDEX "legal_acceptances_userId_version_key" ON "legal_acceptances"("userId", "version");

-- AddForeignKey
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

