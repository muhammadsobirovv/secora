export interface ParsedToolCall {
  name: string;
  input: Record<string, unknown>;
  /// The exact substring matched, so the caller can strip it out of the
  /// visible response before showing it to the user.
  raw: string;
}

const TOOL_CALL_PATTERN =
  /<tool_call\s+name="([a-z_]+)">([\s\S]*?)<\/tool_call>/i;

/// Provider-agnostic tool-call detection (see security.prompts.ts for the
/// exact tag format every provider is instructed to emit). Looks for the
/// first complete `<tool_call>...</tool_call>` in the accumulated text —
/// AiChatService calls this after every streamed delta once the buffer
/// contains a `<tool_call` opening tag, so detection happens as soon as
/// the closing tag arrives rather than waiting for the whole turn to
/// finish.
export function findToolCall(accumulatedText: string): ParsedToolCall | null {
  const match = TOOL_CALL_PATTERN.exec(accumulatedText);
  if (!match) return null;

  const [raw, name, jsonBody] = match;
  let input: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(jsonBody.trim() || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      input = parsed as Record<string, unknown>;
    }
  } catch {
    // Malformed JSON args — execute with an empty input rather than
    // failing the whole turn; most tools degrade gracefully to "list
    // everything" when given no filters.
  }
  return { name, input, raw };
}

/// True as soon as the buffer contains an opening tag — lets the caller
/// stop scanning on every single delta and only try the (relatively)
/// expensive regex once a call is plausibly present.
export function mightContainToolCall(accumulatedText: string): boolean {
  return accumulatedText.includes('<tool_call');
}
