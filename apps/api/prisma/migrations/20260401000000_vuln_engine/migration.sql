-- AlterEnum
ALTER TYPE "EvidenceType" ADD VALUE 'PAYLOAD';
ALTER TYPE "EvidenceType" ADD VALUE 'COMMAND';

-- CreateEnum
CREATE TYPE "VulnScanner" AS ENUM ('NUCLEI', 'FFUF', 'DIRSEARCH', 'FEROXBUSTER', 'NIKTO');

-- CreateEnum
CREATE TYPE "VulnScanJobStatus" AS ENUM ('PENDING', 'RUNNING', 'PAUSED', 'RETRYING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VulnScanJobLogLevel" AS ENUM ('DEBUG', 'INFO', 'WARN', 'ERROR');

-- CreateEnum
CREATE TYPE "VulnFindingSeverity" AS ENUM ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "VulnFindingStatus" AS ENUM ('NEW', 'CONFIRMED', 'DUPLICATE', 'ACCEPTED_RISK', 'FIXED', 'FALSE_POSITIVE');

-- CreateEnum
CREATE TYPE "VulnFindingConfidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "OwaspCategory" AS ENUM ('A01_BROKEN_ACCESS_CONTROL', 'A02_CRYPTOGRAPHIC_FAILURES', 'A03_INJECTION', 'A04_INSECURE_DESIGN', 'A05_SECURITY_MISCONFIGURATION', 'A06_VULNERABLE_OUTDATED_COMPONENTS', 'A07_IDENTIFICATION_AUTH_FAILURES', 'A08_SOFTWARE_DATA_INTEGRITY_FAILURES', 'A09_LOGGING_MONITORING_FAILURES', 'A10_SERVER_SIDE_REQUEST_FORGERY', 'UNKNOWN');

-- CreateTable
CREATE TABLE "vuln_scan_templates" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scanners" "VulnScanner"[],
    "config" JSONB,
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vuln_scan_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vuln_scan_jobs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "scanners" "VulnScanner"[],
    "templateId" TEXT,
    "config" JSONB,
    "status" "VulnScanJobStatus" NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 2,
    "timeoutSeconds" INTEGER NOT NULL DEFAULT 1800,
    "nextAttemptAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "claimedBy" TEXT,
    "lastHeartbeatAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelRequestedAt" TIMESTAMP(3),
    "pauseRequestedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "error" TEXT,
    "requestedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vuln_scan_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vuln_scan_job_tool_runs" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "scanner" "VulnScanner" NOT NULL,
    "status" "VulnScanJobStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "exitCode" INTEGER,
    "findingsCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "rawOutputEvidenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vuln_scan_job_tool_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vuln_scan_job_logs" (
    "id" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "jobId" TEXT NOT NULL,
    "toolRunId" TEXT,
    "level" "VulnScanJobLogLevel" NOT NULL DEFAULT 'INFO',
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vuln_scan_job_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vuln_findings" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "VulnFindingSeverity" NOT NULL,
    "cvssScore" DOUBLE PRECISION,
    "cvssVector" TEXT,
    "cwe" TEXT,
    "owaspCategory" "OwaspCategory",
    "scanner" "VulnScanner" NOT NULL,
    "scannerVersion" TEXT,
    "confidence" "VulnFindingConfidence" NOT NULL DEFAULT 'MEDIUM',
    "status" "VulnFindingStatus" NOT NULL DEFAULT 'NEW',
    "vulnType" TEXT NOT NULL,
    "path" TEXT,
    "signature" TEXT NOT NULL,
    "matchedAt" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "dedupKey" TEXT NOT NULL,
    "tags" TEXT[],
    "references" TEXT[],
    "createdBy" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "requestEvidenceId" TEXT,
    "responseEvidenceId" TEXT,
    "screenshotEvidenceId" TEXT,
    "payloadEvidenceId" TEXT,
    "commandEvidenceId" TEXT,
    "rawOutputEvidenceId" TEXT,

    CONSTRAINT "vuln_findings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vuln_scan_templates_workspaceId_idx" ON "vuln_scan_templates"("workspaceId");

-- CreateIndex
CREATE INDEX "vuln_scan_jobs_status_priority_createdAt_idx" ON "vuln_scan_jobs"("status", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "vuln_scan_jobs_targetId_idx" ON "vuln_scan_jobs"("targetId");

-- CreateIndex
CREATE INDEX "vuln_scan_jobs_projectId_idx" ON "vuln_scan_jobs"("projectId");

-- CreateIndex
CREATE INDEX "vuln_scan_jobs_workspaceId_idx" ON "vuln_scan_jobs"("workspaceId");

-- CreateIndex
CREATE INDEX "vuln_scan_job_tool_runs_jobId_idx" ON "vuln_scan_job_tool_runs"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "vuln_scan_job_logs_seq_key" ON "vuln_scan_job_logs"("seq");

-- CreateIndex
CREATE INDEX "vuln_scan_job_logs_jobId_seq_idx" ON "vuln_scan_job_logs"("jobId", "seq");

-- CreateIndex
CREATE INDEX "vuln_findings_jobId_idx" ON "vuln_findings"("jobId");

-- CreateIndex
CREATE INDEX "vuln_findings_targetId_severity_idx" ON "vuln_findings"("targetId", "severity");

-- CreateIndex
CREATE INDEX "vuln_findings_projectId_idx" ON "vuln_findings"("projectId");

-- CreateIndex
CREATE INDEX "vuln_findings_workspaceId_status_idx" ON "vuln_findings"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "vuln_findings_targetId_scanner_dedupKey_key" ON "vuln_findings"("targetId", "scanner", "dedupKey");

-- AddForeignKey
ALTER TABLE "vuln_scan_templates" ADD CONSTRAINT "vuln_scan_templates_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vuln_scan_templates" ADD CONSTRAINT "vuln_scan_templates_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vuln_scan_jobs" ADD CONSTRAINT "vuln_scan_jobs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vuln_scan_jobs" ADD CONSTRAINT "vuln_scan_jobs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vuln_scan_jobs" ADD CONSTRAINT "vuln_scan_jobs_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "targets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vuln_scan_jobs" ADD CONSTRAINT "vuln_scan_jobs_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "vuln_scan_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vuln_scan_jobs" ADD CONSTRAINT "vuln_scan_jobs_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vuln_scan_job_tool_runs" ADD CONSTRAINT "vuln_scan_job_tool_runs_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "vuln_scan_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vuln_scan_job_tool_runs" ADD CONSTRAINT "vuln_scan_job_tool_runs_rawOutputEvidenceId_fkey" FOREIGN KEY ("rawOutputEvidenceId") REFERENCES "evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vuln_scan_job_logs" ADD CONSTRAINT "vuln_scan_job_logs_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "vuln_scan_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vuln_scan_job_logs" ADD CONSTRAINT "vuln_scan_job_logs_toolRunId_fkey" FOREIGN KEY ("toolRunId") REFERENCES "vuln_scan_job_tool_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vuln_findings" ADD CONSTRAINT "vuln_findings_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "vuln_scan_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vuln_findings" ADD CONSTRAINT "vuln_findings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vuln_findings" ADD CONSTRAINT "vuln_findings_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vuln_findings" ADD CONSTRAINT "vuln_findings_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "targets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vuln_findings" ADD CONSTRAINT "vuln_findings_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vuln_findings" ADD CONSTRAINT "vuln_findings_requestEvidenceId_fkey" FOREIGN KEY ("requestEvidenceId") REFERENCES "evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vuln_findings" ADD CONSTRAINT "vuln_findings_responseEvidenceId_fkey" FOREIGN KEY ("responseEvidenceId") REFERENCES "evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vuln_findings" ADD CONSTRAINT "vuln_findings_screenshotEvidenceId_fkey" FOREIGN KEY ("screenshotEvidenceId") REFERENCES "evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vuln_findings" ADD CONSTRAINT "vuln_findings_payloadEvidenceId_fkey" FOREIGN KEY ("payloadEvidenceId") REFERENCES "evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vuln_findings" ADD CONSTRAINT "vuln_findings_commandEvidenceId_fkey" FOREIGN KEY ("commandEvidenceId") REFERENCES "evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vuln_findings" ADD CONSTRAINT "vuln_findings_rawOutputEvidenceId_fkey" FOREIGN KEY ("rawOutputEvidenceId") REFERENCES "evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;
