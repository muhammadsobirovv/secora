// HTTP/WS client for the Desktop Agent's Local Bridge Server
// (`apps/desktop/src-tauri/src/bridge/mod.rs`). Used exclusively from the
// background service worker (`background/bridge.ts`) — content scripts,
// the popup, the side panel, and the devtools panel never call this
// directly; they go through `chrome.runtime.sendMessage` to the
// background, which owns the one bridge connection (see
// `shared/types.ts`'s `ExtensionMessage` protocol). Centralizing the
// connection here means only one place ever holds the derived AES key
// and only one place needs to reconnect the Live Sync WebSocket.

import { deriveKey, seal, open, type Envelope } from "./crypto";
import type { BridgeConnection, StreamEvent } from "./types";

const ENCRYPTED_CONTENT_TYPE = "application/vnd.pentesthub.enc+json";

export class BridgeClient {
  private key: CryptoKey | null = null;

  constructor(private connection: BridgeConnection) {}

  static async create(connection: BridgeConnection): Promise<BridgeClient> {
    const client = new BridgeClient(connection);
    client.key = await deriveKey(connection.token);
    return client;
  }

  private async ensureKey(): Promise<CryptoKey> {
    if (!this.key) this.key = await deriveKey(this.connection.token);
    return this.key;
  }

  async health(): Promise<{ ok: boolean; name: string; version: string } | null> {
    try {
      const res = await fetch(`${this.connection.baseUrl}/api/health`, { method: "GET" });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  /** Encrypted request/response round trip against a JSON endpoint. */
  async request<TBody, TResponse>(method: "GET" | "POST" | "PATCH", path: string, body?: TBody): Promise<TResponse> {
    const key = await this.ensureKey();
    const headers: Record<string, string> = { Authorization: `Bearer ${this.connection.token}` };
    let fetchBody: string | undefined;

    if (body !== undefined) {
      const envelope = await seal(key, JSON.stringify(body));
      headers["Content-Type"] = ENCRYPTED_CONTENT_TYPE;
      fetchBody = JSON.stringify(envelope);
    }

    const res = await fetch(`${this.connection.baseUrl}${path}`, { method, headers, body: fetchBody });
    if (!res.ok) {
      let message = `Bridge request failed: ${res.status}`;
      try {
        const errBody = await res.json();
        message = errBody?.message ?? message;
      } catch {
        /* body wasn't JSON (or was still encrypted, e.g. a 401 before the handler ran) */
      }
      throw new BridgeError(message, res.status);
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.startsWith(ENCRYPTED_CONTENT_TYPE)) {
      const envelope = (await res.json()) as Envelope;
      const plaintext = await open(key, envelope);
      return plaintext.length ? (JSON.parse(plaintext) as TResponse) : (undefined as TResponse);
    }
    // GETs with no request body never triggered the encryption layer
    // server-side (see `bridge::middleware`'s doc comment: encryption is
    // keyed off the *request's* content type), so the response is plain
    // JSON in that case.
    return res.json();
  }

  get<TResponse>(path: string): Promise<TResponse> {
    return this.request("GET", path);
  }
  post<TBody, TResponse>(path: string, body: TBody): Promise<TResponse> {
    return this.request("POST", path, body);
  }
  patch<TBody, TResponse>(path: string, body: TBody): Promise<TResponse> {
    return this.request("PATCH", path, body);
  }

  /**
   * Streams `/api/ai/analyze` via Server-Sent Events. `fetch()` +
   * `ReadableStream` works from a MV3 background service worker (unlike
   * `EventSource`, which service workers can't construct) — this parses
   * the `data: ...\n\n` framing by hand rather than pulling in an SSE
   * parser dependency, since the framing is simple and fixed (one JSON
   * object per `Event::default().data(...)` on the Rust side, see
   * `bridge::routes::ai_analyze`).
   */
  /**
   * Returns the conversation id (from the `X-Conversation-Id` response
   * header — read *before* consuming the stream, see
   * `bridge::routes::ai_analyze`'s doc comment for why that header
   * exists instead of an in-band "first event") plus an async generator
   * of deltas. Callers should store the id and pass it back as
   * `conversationId` on the next call to keep multi-turn context.
   */
  async streamAiAnalyze(body: unknown): Promise<{ conversationId: string | null; events: AsyncGenerator<StreamEvent> }> {
    const key = await this.ensureKey();
    const envelope = await seal(key, JSON.stringify(body));
    const res = await fetch(`${this.connection.baseUrl}/api/ai/analyze`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.connection.token}`, "Content-Type": ENCRYPTED_CONTENT_TYPE },
      body: JSON.stringify(envelope),
    });
    if (!res.ok || !res.body) throw new BridgeError(`AI stream failed: ${res.status}`, res.status);

    const conversationId = res.headers.get("X-Conversation-Id");

    // SSE responses are NOT wrapped in the AES-GCM envelope (see
    // `bridge::middleware`'s doc comment — the encryption layer buffers
    // the whole response to encrypt it, which is fundamentally
    // incompatible with a streamed response; the AI stream trades that
    // protection for real-time deltas, acceptable since it's all
    // loopback-only traffic anyway).
    async function* iterate(): AsyncGenerator<StreamEvent> {
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const raw of events) {
          const line = raw.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          const json = line.slice("data:".length).trim();
          try {
            yield JSON.parse(json) as StreamEvent;
          } catch {
            /* malformed frame — skip rather than abort the whole stream */
          }
        }
      }
    }

    return { conversationId, events: iterate() };
  }

  /** Opens the Live Sync WebSocket. Auth via `?token=` query param — see
   * `bridge::ws`'s doc comment for why (browsers can't set WS headers). */
  connectLiveSync(onMessage: (data: unknown) => void, onClose: () => void): WebSocket {
    const wsUrl = this.connection.baseUrl.replace(/^http/, "ws") + `/api/ws?token=${encodeURIComponent(this.connection.token)}`;
    const socket = new WebSocket(wsUrl);
    socket.onmessage = (event) => {
      try {
        onMessage(JSON.parse(event.data));
      } catch {
        /* ignore malformed frames */
      }
    };
    socket.onclose = onClose;
    socket.onerror = () => socket.close();
    return socket;
  }
}

export class BridgeError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "BridgeError";
  }
}
