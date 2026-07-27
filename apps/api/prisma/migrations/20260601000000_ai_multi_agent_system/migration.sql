-- Module 11: AI Security Copilot + Autonomous Multi-Agent System
-- Additive only — extends Module 5's AI schema, never rewrites it.

-- AlterEnum: new AiMemorySourceType values so agent/knowledge-base content
-- feeds the existing RAG store (see schema.prisma comment on this enum).
ALTER TYPE "AiMemorySourceType" ADD VALUE IF NOT EXISTS 'KNOWLEDGE_BASE_REFERENCE';
ALTER TYPE "AiMemorySourceType" ADD VALUE IF NOT EXISTS 'AGENT_TASK_OUTPUT';
ALTER TYPE "AiMemorySourceType" ADD VALUE IF NOT EXISTS 'ORCHESTRATION_RUN';

-- AlterTable: AI Chat conversation branching.
ALTER TABLE "ai_messages" ADD COLUMN "parentMessageId" TEXT;
CREATE INDEX "ai_messages_parentMessageId_idx" ON "ai_messages"("parentMessageId");
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_parentMessageId_fkey"
  FOREIGN KEY ("parentMessageId") REFERENCES "ai_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: Long-Term Memory expiration policies.
ALTER TABLE "ai_memory_chunks" ADD COLUMN "expiresAt" TIMESTAMP(3);
CREATE INDEX "ai_memory_chunks_expiresAt_idx" ON "ai_memory_chunks"("expiresAt");

-- CreateEnum
CREATE TYPE "AgentType" AS ENUM (
  'RECON', 'WEB', 'API', 'MOBILE', 'CLOUD', 'ACTIVE_DIRECTORY',
  'AI_RESEARCH', 'EXPLOIT_ANALYSIS', 'REPORT_WRITER', 'CODE_REVIEW',
  'RISK_ASSESSMENT', 'WORKFLOW_COORDINATOR'
);

-- CreateEnum
CREATE TYPE "OrchestrationRunStatus" AS ENUM ('PENDING', 'PLANNING', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AgentTaskStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'RETRYING');

-- CreateEnum
CREATE TYPE "KnowledgeBaseReferenceFramework" AS ENUM ('OWASP', 'CWE', 'CAPEC', 'MITRE_ATTACK', 'NIST', 'CVE');

-- CreateTable
CREATE TABLE "orchestration_runs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT,
    "userId" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "status" "OrchestrationRunStatus" NOT NULL DEFAULT 'PENDING',
    "planJson" JSONB,
    "resultSummary" TEXT,
    "confidenceScore" DOUBLE PRECISION,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orchestration_runs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "orchestration_runs_workspaceId_projectId_idx" ON "orchestration_runs"("workspaceId", "projectId");
CREATE INDEX "orchestration_runs_userId_createdAt_idx" ON "orchestration_runs"("userId", "createdAt");
ALTER TABLE "orchestration_runs" ADD CONSTRAINT "orchestration_runs_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "orchestration_runs" ADD CONSTRAINT "orchestration_runs_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "orchestration_runs" ADD CONSTRAINT "orchestration_runs_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "agent_tasks" (
    "id" TEXT NOT NULL,
    "orchestrationRunId" TEXT NOT NULL,
    "parentTaskId" TEXT,
    "agentType" "AgentType" NOT NULL,
    "title" TEXT NOT NULL,
    "input" JSONB,
    "output" JSONB,
    "status" "AgentTaskStatus" NOT NULL DEFAULT 'QUEUED',
    "reasoningSummary" TEXT,
    "confidenceScore" DOUBLE PRECISION,
    "sources" JSONB,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_tasks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "agent_tasks_orchestrationRunId_status_idx" ON "agent_tasks"("orchestrationRunId", "status");
CREATE INDEX "agent_tasks_parentTaskId_idx" ON "agent_tasks"("parentTaskId");
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_orchestrationRunId_fkey"
  FOREIGN KEY ("orchestrationRunId") REFERENCES "orchestration_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_parentTaskId_fkey"
  FOREIGN KEY ("parentTaskId") REFERENCES "agent_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "agent_tool_call_logs" (
    "id" TEXT NOT NULL,
    "agentTaskId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "errorMessage" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_tool_call_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "agent_tool_call_logs_agentTaskId_createdAt_idx" ON "agent_tool_call_logs"("agentTaskId", "createdAt");
ALTER TABLE "agent_tool_call_logs" ADD CONSTRAINT "agent_tool_call_logs_agentTaskId_fkey"
  FOREIGN KEY ("agentTaskId") REFERENCES "agent_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "knowledge_base_reference_entries" (
    "id" TEXT NOT NULL,
    "framework" "KnowledgeBaseReferenceFramework" NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "url" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_base_reference_entries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "knowledge_base_reference_entries_framework_code_key" ON "knowledge_base_reference_entries"("framework", "code");
CREATE INDEX "knowledge_base_reference_entries_framework_idx" ON "knowledge_base_reference_entries"("framework");

-- CreateTable
CREATE TABLE "prompt_templates" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "promptText" TEXT NOT NULL,
    "category" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prompt_templates_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "prompt_templates_workspaceId_category_idx" ON "prompt_templates"("workspaceId", "category");
ALTER TABLE "prompt_templates" ADD CONSTRAINT "prompt_templates_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prompt_templates" ADD CONSTRAINT "prompt_templates_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
