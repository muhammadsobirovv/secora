import type { AiProviderName } from '@pentesthub/shared';

export type AiChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface AiChatMessage {
  role: AiChatRole;
  content: string;
}

export interface AiChatCompletionOptions {
  model: string;
  messages: AiChatMessage[];
  maxTokens: number;
  temperature?: number;
  signal?: AbortSignal;
}

/// One incremental piece of a streamed completion. `done` is set on the
/// final chunk (which may also carry token-usage counts, when the provider
/// reports them) — providers that don't report usage leave those fields
/// undefined rather than guessing.
export interface AiChatStreamChunk {
  delta: string;
  done?: boolean;
  promptTokens?: number;
  completionTokens?: number;
}

export interface AiEmbeddingResult {
  embedding: number[];
  dimensions: number;
}

/// Thrown when a provider is asked to do work (chat/embed) while
/// unconfigured (no API key / no reachable local server) — always caught
/// at the AiChatService boundary and turned into a clear, user-facing
/// error rather than a raw fetch failure. Never thrown at boot: an
/// unconfigured provider is a valid, listed-but-disabled entry in
/// GET /ai/providers, not a startup failure (AI Provider Architecture).
export class AiProviderNotConfiguredError extends Error {
  constructor(public readonly provider: AiProviderName) {
    super(
      `AI provider "${provider}" is not configured — missing API key or endpoint.`,
    );
    this.name = 'AiProviderNotConfiguredError';
  }
}

export class AiProviderRequestError extends Error {
  constructor(
    public readonly provider: AiProviderName,
    message: string,
  ) {
    super(message);
    this.name = 'AiProviderRequestError';
  }
}

/// One adapter per supported LLM backend. `streamChatCompletion` yields
/// text deltas as they arrive — every adapter normalizes its own
/// provider-specific SSE/NDJSON wire format down to this one shape, so
/// AiChatService (and the tool-calling loop built on top of it) never
/// branches on which provider is active. `embed` is used only by the RAG
/// layer; a provider that doesn't offer embeddings (e.g. Anthropic has no
/// embeddings API) may throw AiProviderRequestError — AiMemoryService
/// always calls the embedding provider (AI_EMBEDDING_PROVIDER-selected,
/// defaults to OpenAI) rather than assuming the chat provider doubles as
/// the embedding provider.
export interface AiProvider {
  readonly name: AiProviderName;
  isConfigured(): boolean;
  getDefaultModel(): string;
  streamChatCompletion(
    options: AiChatCompletionOptions,
  ): AsyncIterable<AiChatStreamChunk>;
  embed(text: string): Promise<AiEmbeddingResult>;
}
