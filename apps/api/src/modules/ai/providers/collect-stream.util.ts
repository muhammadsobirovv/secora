import type {
  AiChatCompletionOptions,
  AiProvider,
} from './ai-provider.interface.js';

/// Consumes a provider's token stream into one final string. Used by
/// non-interactive callers (tools like draft_report/generate_poc/
/// generate_payloads, and the finding-event auto-summary handler) that
/// need a complete result to store/return rather than a live SSE feed —
/// AiChatService itself never uses this, it streams directly to the
/// client.
export async function collectStreamedCompletion(
  provider: AiProvider,
  options: AiChatCompletionOptions,
): Promise<string> {
  let text = '';
  for await (const chunk of provider.streamChatCompletion(options)) {
    text += chunk.delta;
  }
  return text;
}
