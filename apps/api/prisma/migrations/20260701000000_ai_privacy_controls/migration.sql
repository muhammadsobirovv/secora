-- Module 11: AI Security Copilot + Autonomous Multi-Agent System (task #234)
-- Privacy controls — per-workspace AI privacy mode (cloud/local/hybrid).
-- Additive only — new enum + new standalone table, no existing table altered.

-- CreateEnum
CREATE TYPE "AiPrivacyMode" AS ENUM ('CLOUD', 'LOCAL', 'HYBRID');

-- CreateTable
CREATE TABLE "workspace_ai_privacy_settings" (
    "workspaceId" TEXT NOT NULL,
    "mode" "AiPrivacyMode" NOT NULL DEFAULT 'CLOUD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_ai_privacy_settings_pkey" PRIMARY KEY ("workspaceId")
);

-- AddForeignKey
ALTER TABLE "workspace_ai_privacy_settings" ADD CONSTRAINT "workspace_ai_privacy_settings_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
