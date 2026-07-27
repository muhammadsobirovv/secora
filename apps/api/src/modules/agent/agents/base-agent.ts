import type { AgentTaskSourceRef, AgentType } from '@pentesthub/shared';
import type { AiToolName } from '@pentesthub/shared';

/// One prior sibling/ancestor task's result, folded into a downstream
/// agent's prompt as context (Task Delegation: a WORKFLOW_COORDINATOR
/// splitting a goal into ordered steps means later steps can see what
/// earlier ones found, not just their own isolated instruction).
export interface AgentUpstreamResult {
  agentType: AgentType;
  title: string;
  output: Record<string, unknown> | null;
}

export interface AgentExecutionInput {
  workspaceId: string;
  projectId: string | null;
  userId: string;
  /// This task's own instruction (one step of the orchestrator's
  /// OrchestrationPlanDto), not the user's original top-level goal.
  title: string;
  input: Record<string, unknown> | null;
  upstreamContext: AgentUpstreamResult[];
  provider?: string;
  model?: string;
}

export interface AgentToolCallRecord {
  toolName: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  errorMessage: string | null;
  durationMs: number;
}

export interface AgentExecutionResult {
  output: Record<string, unknown>;
  /// Explainability — a short human-readable "why" for this result.
  reasoningSummary: string;
  /// Explainability — 0..1 self-reported confidence.
  confidenceScore: number;
  sources: AgentTaskSourceRef[];
  toolCalls: AgentToolCallRecord[];
}

/// One specialist in the Multi-Agent Architecture (Recon, Web, API,
/// Mobile, Cloud, Active Directory, AI Research, Exploit Analysis, Report
/// Writer, Code Review, Risk Assessment, Workflow Coordinator).
///
/// Per the Module 11 spec, "each agent must have": its own memory (handled
/// externally by AiMemoryService, sourceType 'AGENT_TASK_OUTPUT' —
/// see AgentOrchestratorService, not this class), tool permissions
/// (`allowedTools` below), a task queue (AgentTask rows with status
/// QUEUED/RUNNING, owned by the orchestrator, not this class), delegation
/// support (a WORKFLOW_COORDINATOR agent's output can propose sub-tasks;
/// the orchestrator creates the child AgentTask rows), cancellation
/// (the `signal` passed to `execute` — an agent must respect it,
/// forwarding it into any AI provider / tool call it makes), progress
/// reporting (AgentOrchestratorService.onProgress callback, not this
/// class), and structured output (`AgentExecutionResult.output`).
///
/// Concrete agents don't implement `execute` directly — they extend
/// PromptDrivenAgent (prompt-driven-agent.base.ts), which supplies the
/// actual AI-provider plumbing and only asks each agent for its
/// specialty's prompt + output shape.
export abstract class BaseAgent {
  abstract readonly type: AgentType;
  abstract readonly displayName: string;
  abstract readonly description: string;
  /// Tool Permissions — the subset of AI_TOOL_NAMES this agent may invoke.
  /// Enforced in PromptDrivenAgent.execute()'s tool-calling loop (see
  /// prompt-driven-agent.base.ts): a tool-call outside this list is
  /// rejected — the model is told why rather than the call silently
  /// reaching AiToolRegistryService.
  abstract readonly allowedTools: readonly AiToolName[];

  abstract execute(
    input: AgentExecutionInput,
    signal: AbortSignal,
  ): Promise<AgentExecutionResult>;
}
