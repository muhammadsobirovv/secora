import { API_BASE_URL } from "@/lib/api/client";
import { useAuthStore } from "@/lib/stores/auth-store";

export interface AssistantTurn {
  role: "user" | "assistant";
  content: string;
}

export class AssistantStreamError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "AssistantStreamError";
  }
}

/// Streams a reply from the floating Secora AI helper. Calls `onDelta` for each
/// text chunk; resolves when the stream completes. Pre-stream failures (e.g.
/// the free-tier daily limit, HTTP 429) throw AssistantStreamError with the
/// API's error code.
export async function streamAssistantReply(
  messages: AssistantTurn[],
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const token = useAuthStore.getState().accessToken;
  const response = await fetch(`${API_BASE_URL}/ai/assistant/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: "include",
    body: JSON.stringify({ messages }),
    signal,
  });

  if (!response.ok || !response.body) {
    let message = `Request failed (${response.status})`;
    let code: string | undefined;
    try {
      const body = (await response.json()) as {
        message?: string;
        code?: string;
        error?: { message?: string; code?: string };
      };
      message = body.error?.message ?? body.message ?? message;
      code = body.error?.code ?? body.code;
    } catch {
      /* non-JSON body */
    }
    throw new AssistantStreamError(message, code);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      for (const line of block.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const raw = line.slice(5).trim();
        if (!raw) continue;
        let event: { type?: string; content?: string; message?: string };
        try {
          event = JSON.parse(raw) as typeof event;
        } catch {
          continue;
        }
        if (event.type === "delta" && event.content) onDelta(event.content);
        else if (event.type === "error") {
          throw new AssistantStreamError(event.message ?? "AI request failed.");
        }
      }
    }
  }
}
