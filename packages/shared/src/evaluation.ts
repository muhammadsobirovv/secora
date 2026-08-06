// Module 13 — AI Evaluation (task #289). One flat `EvaluationRun` model
// backs all seven metrics — see `EvaluationRun`'s Prisma doc comment for
// why this stayed a single table instead of seven.

export type EvaluationMetricType =
  | "RESPONSE_QUALITY"
  | "HALLUCINATION_RATE"
  | "TOOL_SUCCESS_RATE"
  | "WORKFLOW_SUCCESS"
  | "EXECUTION_TIME"
  | "PROMPT_EFFECTIVENESS"
  | "PROVIDER_COMPARISON";

export type EvaluationSubjectType = "PROMPT" | "AGENT" | "WORKFLOW" | "PROVIDER" | "MCP_TOOL";

export interface EvaluationRunDto {
  id: string;
  workspaceId: string;
  metricType: EvaluationMetricType;
  subjectType: EvaluationSubjectType;
  subjectId: string | null;
  provider: string | null;
  model: string | null;
  score: number | null;
  result: Record<string, unknown> | null;
  createdBy: string | null;
  createdAt: string;
}

export interface RunEvaluationRequestDto {
  metricType: EvaluationMetricType;
  subjectType: EvaluationSubjectType;
  subjectId?: string;
  provider?: string;
  model?: string;
  /// Metric-specific input — e.g. RESPONSE_QUALITY takes
  /// `{ prompt: string; response: string }`, TOOL_SUCCESS_RATE takes
  /// `{ toolName: string; sinceDays?: number }` (an aggregation over
  /// `McpToolInvocation`, no fresh call made). See the Developer Guide's
  /// Evaluation section for each metric's exact input/output shape.
  input?: Record<string, unknown>;
}

export interface ListEvaluationRunsQueryDto {
  metricType?: EvaluationMetricType;
  subjectType?: EvaluationSubjectType;
  subjectId?: string;
  limit?: number;
}

export interface EvaluationSummaryDto {
  metricType: EvaluationMetricType;
  sampleCount: number;
  averageScore: number | null;
  latestScore: number | null;
}
