-- Module 13: AI Automation Platform + MCP Ecosystem + Security Agent SDK
-- Additive only — new enums + new standalone tables. No existing table
-- altered (mirrors Module 11's ai_multi_agent_system/ai_privacy_controls
-- migrations). One enum (PluginCategory) gets new values appended — safe
-- because Postgres ALTER TYPE ... ADD VALUE never breaks rows using the
-- existing values, and no code branches on "is this the full set of
-- categories" in a way a new value could silently break.

-- AlterEnum: PluginCategory — Automation Marketplace pack types (task #287)
ALTER TYPE "PluginCategory" ADD VALUE 'PROMPT_PACK';
ALTER TYPE "PluginCategory" ADD VALUE 'WORKFLOW_PACK';
ALTER TYPE "PluginCategory" ADD VALUE 'RECON_PACK';
ALTER TYPE "PluginCategory" ADD VALUE 'SCANNER_PACK';
ALTER TYPE "PluginCategory" ADD VALUE 'REPORT_TEMPLATE';
ALTER TYPE "PluginCategory" ADD VALUE 'PLAYBOOK';
ALTER TYPE "PluginCategory" ADD VALUE 'AGENT_PACK';
ALTER TYPE "PluginCategory" ADD VALUE 'THEME_PACK';
ALTER TYPE "PluginCategory" ADD VALUE 'LANGUAGE_PACK';

-- CreateEnum
CREATE TYPE "McpSessionStatus" AS ENUM ('ACTIVE', 'CLOSED', 'EXPIRED');
CREATE TYPE "PromptTestRunStatus" AS ENUM ('SUCCEEDED', 'FAILED');
CREATE TYPE "AgentSdkKind" AS ENUM ('BUILTIN', 'CUSTOM');
CREATE TYPE "AgentSdkStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DISABLED');
CREATE TYPE "AgentSdkRunStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');
CREATE TYPE "ScriptLanguage" AS ENUM ('TYPESCRIPT', 'JAVASCRIPT', 'PYTHON');
CREATE TYPE "ScriptExecutionStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'TIMEOUT');
CREATE TYPE "EvaluationMetricType" AS ENUM ('RESPONSE_QUALITY', 'HALLUCINATION_RATE', 'TOOL_SUCCESS_RATE', 'WORKFLOW_SUCCESS', 'EXECUTION_TIME', 'PROMPT_EFFECTIVENESS', 'PROVIDER_COMPARISON');
CREATE TYPE "EvaluationSubjectType" AS ENUM ('PROMPT', 'AGENT', 'WORKFLOW', 'PROVIDER', 'MCP_TOOL');

-- CreateTable: mcp_sessions
CREATE TABLE "mcp_sessions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "apiKeyId" TEXT,
    "clientName" TEXT NOT NULL,
    "clientVersion" TEXT,
    "protocolVersion" TEXT NOT NULL,
    "transport" TEXT NOT NULL,
    "status" "McpSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "capabilitiesJson" JSONB,
    "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "mcp_sessions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "mcp_sessions_workspaceId_status_idx" ON "mcp_sessions"("workspaceId", "status");
CREATE INDEX "mcp_sessions_apiKeyId_idx" ON "mcp_sessions"("apiKeyId");
ALTER TABLE "mcp_sessions" ADD CONSTRAINT "mcp_sessions_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: mcp_tool_invocations
CREATE TABLE "mcp_tool_invocations" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "inputJson" JSONB,
    "outputJson" JSONB,
    "errorMessage" TEXT,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_tool_invocations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "mcp_tool_invocations_sessionId_idx" ON "mcp_tool_invocations"("sessionId");
CREATE INDEX "mcp_tool_invocations_workspaceId_toolName_createdAt_idx" ON "mcp_tool_invocations"("workspaceId", "toolName", "createdAt");
ALTER TABLE "mcp_tool_invocations" ADD CONSTRAINT "mcp_tool_invocations_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "mcp_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: prompt_template_versions
CREATE TABLE "prompt_template_versions" (
    "id" TEXT NOT NULL,
    "promptTemplateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "promptText" TEXT NOT NULL,
    "variablesJson" JSONB,
    "changelog" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_template_versions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "prompt_template_versions_promptTemplateId_version_key" ON "prompt_template_versions"("promptTemplateId", "version");
CREATE INDEX "prompt_template_versions_promptTemplateId_idx" ON "prompt_template_versions"("promptTemplateId");
ALTER TABLE "prompt_template_versions" ADD CONSTRAINT "prompt_template_versions_promptTemplateId_fkey"
  FOREIGN KEY ("promptTemplateId") REFERENCES "prompt_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: prompt_test_runs
CREATE TABLE "prompt_test_runs" (
    "id" TEXT NOT NULL,
    "promptTemplateId" TEXT NOT NULL,
    "promptTemplateVersion" INTEGER,
    "workspaceId" TEXT NOT NULL,
    "inputVariablesJson" JSONB,
    "renderedPrompt" TEXT NOT NULL,
    "outputText" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "status" "PromptTestRunStatus" NOT NULL DEFAULT 'SUCCEEDED',
    "errorMessage" TEXT,
    "durationMs" INTEGER,
    "ratingScore" INTEGER,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_test_runs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "prompt_test_runs_promptTemplateId_createdAt_idx" ON "prompt_test_runs"("promptTemplateId", "createdAt");
ALTER TABLE "prompt_test_runs" ADD CONSTRAINT "prompt_test_runs_promptTemplateId_fkey"
  FOREIGN KEY ("promptTemplateId") REFERENCES "prompt_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: agent_sdk_definitions
CREATE TABLE "agent_sdk_definitions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "workspaceId" TEXT,
    "pluginId" TEXT,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "kind" "AgentSdkKind" NOT NULL,
    "status" "AgentSdkStatus" NOT NULL DEFAULT 'ACTIVE',
    "manifestJson" JSONB NOT NULL,
    "sourceCode" TEXT,
    "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_sdk_definitions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "agent_sdk_definitions_workspaceId_slug_key" ON "agent_sdk_definitions"("workspaceId", "slug");
CREATE INDEX "agent_sdk_definitions_organizationId_idx" ON "agent_sdk_definitions"("organizationId");
ALTER TABLE "agent_sdk_definitions" ADD CONSTRAINT "agent_sdk_definitions_pluginId_fkey"
  FOREIGN KEY ("pluginId") REFERENCES "plugins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: agent_sdk_runs
CREATE TABLE "agent_sdk_runs" (
    "id" TEXT NOT NULL,
    "agentSdkDefinitionId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT,
    "status" "AgentSdkRunStatus" NOT NULL DEFAULT 'PENDING',
    "inputJson" JSONB,
    "outputJson" JSONB,
    "eventsJson" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_sdk_runs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "agent_sdk_runs_agentSdkDefinitionId_createdAt_idx" ON "agent_sdk_runs"("agentSdkDefinitionId", "createdAt");
CREATE INDEX "agent_sdk_runs_workspaceId_status_idx" ON "agent_sdk_runs"("workspaceId", "status");
-- Performance (task #294): AiPlatformObservabilityRepository.agentSdkRunsSummary()
CREATE INDEX "agent_sdk_runs_workspaceId_createdAt_idx" ON "agent_sdk_runs"("workspaceId", "createdAt");
ALTER TABLE "agent_sdk_runs" ADD CONSTRAINT "agent_sdk_runs_agentSdkDefinitionId_fkey"
  FOREIGN KEY ("agentSdkDefinitionId") REFERENCES "agent_sdk_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: script_definitions
CREATE TABLE "script_definitions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "language" "ScriptLanguage" NOT NULL,
    "sourceCode" TEXT NOT NULL,
    "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "script_definitions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "script_definitions_workspaceId_idx" ON "script_definitions"("workspaceId");

-- CreateTable: script_executions
CREATE TABLE "script_executions" (
    "id" TEXT NOT NULL,
    "scriptDefinitionId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "status" "ScriptExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "inputJson" JSONB,
    "outputJson" JSONB,
    "logs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "errorMessage" TEXT,
    "durationMs" INTEGER,
    "triggeredBy" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "script_executions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "script_executions_scriptDefinitionId_createdAt_idx" ON "script_executions"("scriptDefinitionId", "createdAt");
-- Performance (task #294): AiPlatformObservabilityRepository.scriptExecutionsSummary()
CREATE INDEX "script_executions_workspaceId_createdAt_idx" ON "script_executions"("workspaceId", "createdAt");
ALTER TABLE "script_executions" ADD CONSTRAINT "script_executions_scriptDefinitionId_fkey"
  FOREIGN KEY ("scriptDefinitionId") REFERENCES "script_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: evaluation_runs
CREATE TABLE "evaluation_runs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "metricType" "EvaluationMetricType" NOT NULL,
    "subjectType" "EvaluationSubjectType" NOT NULL,
    "subjectId" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "score" DOUBLE PRECISION,
    "resultJson" JSONB,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluation_runs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "evaluation_runs_workspaceId_metricType_createdAt_idx" ON "evaluation_runs"("workspaceId", "metricType", "createdAt");
CREATE INDEX "evaluation_runs_subjectType_subjectId_idx" ON "evaluation_runs"("subjectType", "subjectId");

-- CreateTable: workflow_webhook_triggers (task #283)
CREATE TABLE "workflow_webhook_triggers" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_webhook_triggers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "workflow_webhook_triggers_token_key" ON "workflow_webhook_triggers"("token");
CREATE INDEX "workflow_webhook_triggers_workflowId_idx" ON "workflow_webhook_triggers"("workflowId");
ALTER TABLE "workflow_webhook_triggers" ADD CONSTRAINT "workflow_webhook_triggers_workflowId_fkey"
  FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Local Execution (task #288)
CREATE TYPE "RelayCommandTarget" AS ENUM ('DESKTOP', 'BROWSER');
CREATE TYPE "RelayCommandStatus" AS ENUM ('PENDING', 'DELIVERED', 'COMPLETED', 'FAILED');

-- CreateTable: relay_commands
CREATE TABLE "relay_commands" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "target" "RelayCommandTarget" NOT NULL,
    "commandType" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "status" "RelayCommandStatus" NOT NULL DEFAULT 'PENDING',
    "resultJson" JSONB,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "relay_commands_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "relay_commands_workspaceId_target_status_idx" ON "relay_commands"("workspaceId", "target", "status");
