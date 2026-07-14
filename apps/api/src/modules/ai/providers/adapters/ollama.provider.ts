import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../../../config/env.validation.js';
import type {
  AiChatCompletionOptions,
  AiChatStreamChunk,
  AiEmbeddingResult,
  AiProvider,
} from '../ai-provider.interface.js';
import {
  AiProviderNotConfiguredError,
  AiProviderRequestError,
} from '../ai-provider.interface.js';

/// Ollama's /api/chat streams newline-delimited JSON (NDJSON), not SSE —
/// no `data:`/`event:` framing at all, just one JSON object per line. No
/// API key: "configured" means an operator explicitly set
/// AI_OLLAMA_BASE_URL (see env.validation.ts comment on that key).
@Injectable()
export class OllamaProvider implements AiProvider {
  readonly name = 'OLLAMA' as const;

  constructor(private readonly configService: ConfigService<EnvConfig, true>) {}

  private getBaseUrl(): string | undefined {
    return this.configService.get('AI_OLLAMA_BASE_URL', { infer: true });
  }

  isConfigured(): boolean {
    return Boolean(this.getBaseUrl());
  }

  getDefaultModel(): string {
    return this.configService.get('AI_OLLAMA_MODEL', { infer: true });
  }

  async *streamChatCompletion(
    options: AiChatCompletionOptions,
  ): AsyncIterable<AiChatStreamChunk> {
    const baseUrl = this.getBaseUrl();
    if (!baseUrl) throw new AiProviderNotConfiguredError(this.name);

    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: options.signal,
      body: JSON.stringify({
        model: options.model,
        messages: options.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        options: {
          temperature: options.temperature ?? 0.2,
          num_predict: options.maxTokens,
        },
        stream: true,
      }),
    });

    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '');
      throw new AiProviderRequestError(
        this.name,
        `Ollama request failed (${response.status}): ${text}`,
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;

        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (!line) continue;
          try {
            const parsed = JSON.parse(line) as {
              message?: { content?: string };
              done?: boolean;
              prompt_eval_count?: number;
              eval_count?: number;
            };
            const delta = parsed.message?.content ?? '';
            if (delta) yield { delta };
            if (parsed.done) {
              yield {
                delta: '',
                done: true,
                promptTokens: parsed.prompt_eval_count,
                completionTokens: parsed.eval_count,
              };
              return;
            }
          } catch {
            // Ignore malformed line.
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async embed(text: string): Promise<AiEmbeddingResult> {
    const baseUrl = this.getBaseUrl();
    if (!baseUrl) throw new AiProviderNotConfiguredError(this.name);

    const response = await fetch(
      `${baseUrl.replace(/\/$/, '')}/api/embeddings`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.getDefaultModel(), prompt: text }),
      },
    );

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new AiProviderRequestError(
        this.name,
        `Ollama embeddings request failed (${response.status}): ${body}`,
      );
    }

    const data = (await response.json()) as { embedding?: number[] };
    const embedding = data.embedding ?? [];
    return { embedding, dimensions: embedding.length };
  }
}
