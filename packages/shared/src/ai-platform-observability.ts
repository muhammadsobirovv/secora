// Module 13 — AI Automation Platform Observability (task #290). A single
// workspace-scoped dashboard aggregating operational stats across every
// Module 13 automation surface — MCP tool usage, Agent SDK runs, Script
// Engine executions, Workflow Builder runs, Local Execution's relay
// command queue, and AI Evaluation samples. Deliberately separate from
// `pentesthub_*` Prometheus text exposition (Module 10's
// `MetricsRegistryService`/`GET /observability/metrics`, `@Public()`,
// unauthenticated, scrape-shaped): this is an authenticated, workspace-
// scoped, human/dashboard-shaped JSON view over the same underlying
// activity, answering "what has my workspace's AI automation been doing"
// rather than "is the process healthy" — same distinction Grafana draws
// between a Prometheus scrape target and an application-level API.

export interface McpToolUsageSummaryDto {
  toolName: string;
  callCount: number;
  errorCount: number;
  avgDurationMs: number | null;
}

export interface AgentSdkRunsSummaryDto {
  totalRuns: number;
  succeeded: number;
  failed: number;
  running: number;
  avgDurationMs: number | null;
}

export interface ScriptExecutionsSummaryDto {
  totalExecutions: number;
  succeeded: number;
  failed: number;
  timedOut: number;
  avgDurationMs: number | null;
}

export interface WorkflowRunsSummaryDto {
  totalRuns: number;
  succeeded: number;
  failed: number;
  running: number;
  avgDurationMs: number | null;
}

export interface RelayCommandQueueSummaryDto {
  target: "DESKTOP" | "BROWSER";
  pending: number;
  delivered: number;
  completed: number;
  failed: number;
}

export interface EvaluationRunsSummaryDto {
  metricType: string;
  sampleCount: number;
  averageScore: number | null;
}

export interface AiPlatformObservabilityDto {
  workspaceId: string;
  sinceDays: number;
  generatedAt: string;
  mcpToolUsage: McpToolUsageSummaryDto[];
  agentSdkRuns: AgentSdkRunsSummaryDto;
  scriptExecutions: ScriptExecutionsSummaryDto;
  workflowRuns: WorkflowRunsSummaryDto;
  relayCommandQueue: RelayCommandQueueSummaryDto[];
  evaluationRuns: EvaluationRunsSummaryDto[];
}

export interface GetAiPlatformObservabilityQueryDto {
  sinceDays?: number;
}
