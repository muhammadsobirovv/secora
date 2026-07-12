-- CreateEnum
CREATE TYPE "ReconTool" AS ENUM ('NMAP', 'SUBFINDER', 'HTTPX', 'DNSX', 'NAABU', 'WHATWEB', 'ASSETFINDER', 'GOWITNESS');

-- CreateEnum
CREATE TYPE "ReconJobStatus" AS ENUM ('PENDING', 'RUNNING', 'RETRYING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReconJobLogLevel" AS ENUM ('DEBUG', 'INFO', 'WARN', 'ERROR');

-- CreateEnum
CREATE TYPE "ReconFindingType" AS ENUM ('SUBDOMAIN', 'URL', 'OPEN_PORT', 'SERVICE', 'TECHNOLOGY', 'DNS_RECORD', 'HTTP_HEADER', 'CERTIFICATE', 'SCREENSHOT', 'SECURITY_HEADER');

-- CreateTable
CREATE TABLE "recon_jobs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "tools" "ReconTool"[],
    "status" "ReconJobStatus" NOT NULL DEFAULT 'PENDING',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 2,
    "timeoutSeconds" INTEGER NOT NULL DEFAULT 600,
    "nextAttemptAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "claimedBy" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelRequestedAt" TIMESTAMP(3),
    "error" TEXT,
    "requestedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recon_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recon_job_tool_runs" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "tool" "ReconTool" NOT NULL,
    "status" "ReconJobStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "exitCode" INTEGER,
    "findingsCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "rawOutputEvidenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recon_job_tool_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recon_job_logs" (
    "id" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "jobId" TEXT NOT NULL,
    "toolRunId" TEXT,
    "level" "ReconJobLogLevel" NOT NULL DEFAULT 'INFO',
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recon_job_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recon_findings" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "type" "ReconFindingType" NOT NULL,
    "value" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "source" "ReconTool" NOT NULL,
    "dedupKey" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "promotedTargetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recon_findings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recon_jobs_status_createdAt_idx" ON "recon_jobs"("status", "createdAt");

-- CreateIndex
CREATE INDEX "recon_jobs_targetId_idx" ON "recon_jobs"("targetId");

-- CreateIndex
CREATE INDEX "recon_jobs_projectId_idx" ON "recon_jobs"("projectId");

-- CreateIndex
CREATE INDEX "recon_jobs_workspaceId_idx" ON "recon_jobs"("workspaceId");

-- CreateIndex
CREATE INDEX "recon_job_tool_runs_jobId_idx" ON "recon_job_tool_runs"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "recon_job_logs_seq_key" ON "recon_job_logs"("seq");

-- CreateIndex
CREATE INDEX "recon_job_logs_jobId_seq_idx" ON "recon_job_logs"("jobId", "seq");

-- CreateIndex
CREATE INDEX "recon_findings_jobId_idx" ON "recon_findings"("jobId");

-- CreateIndex
CREATE INDEX "recon_findings_targetId_type_idx" ON "recon_findings"("targetId", "type");

-- CreateIndex
CREATE INDEX "recon_findings_projectId_idx" ON "recon_findings"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "recon_findings_targetId_type_dedupKey_key" ON "recon_findings"("targetId", "type", "dedupKey");

-- AddForeignKey
ALTER TABLE "recon_jobs" ADD CONSTRAINT "recon_jobs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recon_jobs" ADD CONSTRAINT "recon_jobs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recon_jobs" ADD CONSTRAINT "recon_jobs_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "targets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recon_jobs" ADD CONSTRAINT "recon_jobs_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recon_job_tool_runs" ADD CONSTRAINT "recon_job_tool_runs_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "recon_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recon_job_tool_runs" ADD CONSTRAINT "recon_job_tool_runs_rawOutputEvidenceId_fkey" FOREIGN KEY ("rawOutputEvidenceId") REFERENCES "evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recon_job_logs" ADD CONSTRAINT "recon_job_logs_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "recon_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recon_job_logs" ADD CONSTRAINT "recon_job_logs_toolRunId_fkey" FOREIGN KEY ("toolRunId") REFERENCES "recon_job_tool_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recon_findings" ADD CONSTRAINT "recon_findings_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "recon_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recon_findings" ADD CONSTRAINT "recon_findings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recon_findings" ADD CONSTRAINT "recon_findings_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recon_findings" ADD CONSTRAINT "recon_findings_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "targets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recon_findings" ADD CONSTRAINT "recon_findings_promotedTargetId_fkey" FOREIGN KEY ("promotedTargetId") REFERENCES "targets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

