/// Minimal SSE frame reader shared by every OpenAI-compatible adapter
/// (OpenAI itself, OpenRouter). Reads a fetch() Response body stream and
/// yields each frame's `data:` payload (with the `[DONE]` sentinel passed
/// through verbatim so callers can detect end-of-stream the same way the
/// wire protocol does). Deliberately not a full SSE spec implementation —
/// no `event:`/`id:`/retry handling — because these APIs only ever send
/// bare `data: <json>\n\n` frames.
export async function* parseSseTextStream(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let separatorIndex: number;

      while ((separatorIndex = buffer.indexOf('\n\n')) !== -1) {
        const rawFrame = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);

        const dataLines = rawFrame
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice('data:'.length).trim());
        if (dataLines.length === 0) continue;

        yield dataLines.join('\n');
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export interface SseEventFrame {
  event: string | undefined;
  data: string;
}

/// Like parseSseTextStream, but preserves the `event:` line — Anthropic's
/// Messages API streaming protocol is event-typed
/// (message_start/content_block_delta/message_stop/...), unlike OpenAI's
/// bare `data:`-only frames.
export async function* parseSseEventStream(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<SseEventFrame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let separatorIndex: number;

      while ((separatorIndex = buffer.indexOf('\n\n')) !== -1) {
        const rawFrame = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);

        let event: string | undefined;
        const dataLines: string[] = [];
        for (const line of rawFrame.split('\n')) {
          if (line.startsWith('event:'))
            event = line.slice('event:'.length).trim();
          else if (line.startsWith('data:'))
            dataLines.push(line.slice('data:'.length).trim());
        }
        if (dataLines.length === 0) continue;
        yield { event, data: dataLines.join('\n') };
      }
    }
  } finally {
    reader.releaseLock();
  }
}
