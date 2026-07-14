import type { AiToolName } from '@pentesthub/shared';

export interface AiToolContext {
  workspaceId: string;
  projectId: string;
  userId: string;
}

/// One internal platform action the AI can invoke (AI Tool Calling).
/// `execute` receives whatever JSON object the model emitted inside its
/// `<tool_call>` tag (see security.prompts.ts) — implementations should
/// validate/coerce loosely rather than throw on a slightly-malformed
/// shape, since the caller is an LLM, not a typed client. Return values
/// must be JSON-serializable and reasonably small (they're fed back into
/// the prompt for the model's next turn — see AiToolLoopService).
///
/// Registering a new tool for a future module: implement this interface,
/// add it to AiToolRegistryService's constructor + map, add its name to
/// AI_TOOL_NAMES in packages/shared/src/ai.ts. AiChatService and the
/// tool-calling loop never change.
export interface AiTool {
  readonly name: AiToolName;
  readonly description: string;
  execute(
    input: Record<string, unknown>,
    context: AiToolContext,
  ): Promise<Record<string, unknown>>;
}
