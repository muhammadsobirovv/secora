import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../../../config/env.validation.js';
import type {
  AiChatCompletionOptions,
  AiChatStreamChunk,
  AiEmbeddingResult,
  AiProvider,
  ResolvedAiCredential,
} from '../ai-provider.interface.js';
import {
  AiProviderNotConfiguredError,
  AiProviderRequestError,
} from '../ai-provider.interface.js';

/// Ollama's /api/chat streams newline-delimited JSON (NDJSON), not SSE —
/// no `data:`/`event:` framing at all, just one JSON object per line. No
/// API key: "configured" means either the operator explicitly set
/// AI_OLLAMA_BASE_URL (see env.validation.ts comment on that key), or a
/// workspace has pointed its own BYOK credential's `baseUrl` at a
/// reachable Ollama/LM Studio-compatible server (Local-First Migration
/// Phase 1 — this is the no-key default path: a workspace with no cloud
/// key configured falls back to Ollama, per the spec's "default to Ollama
/// if no key" rule).
///
/// Module 18 — task #514 (SSRF/network security centralization),
/// deliberate exception, not an oversight: `credential.baseUrl` is
/// intentionally allowed to point at a private/internal address (that's
/// the entire point — a self-hosted Ollama instance on the same network,
/// or `localhost` for a single-machine deployment) and is NOT run through
/// `assertSafeWebhookUrl`, unlike every user-URL outbound call elsewhere
/// in this codebase. This is acceptable because a workspace's own BYOK AI
/// credential is workspace-owner-configured, trusted configuration (the
/// same trust level as `AI_OLLAMA_BASE_URL` itself, an operator env var),
/// not attacker- or low-privilege-user-controlled input — closer to the
/// "operator already trusts this" tier the TAXII/vendor-feed URLs (env-
/// var configured) are in than to the webhook/workflow-URL tier that gets
/// the SSRF guard. If BYOK credential configuration is ever opened up to
/// a lower-trust role than workspace owner, this exception needs
/// revisiting.
@Injectable()
export class OllamaProvider implements AiProvider {
  readonly name = 'OLLAMA' as const;

  constructor(private readonly configService: ConfigService<EnvConfig, true>) {}

  private getBaseUrl(credential?: ResolvedAiCredential): string | undefined {
    return (
      credential?.baseUrl ??
      this.configService.get('AI_OLLAMA_BASE_URL', { infer: true })
    );
  }

  isConfigured(credential?: ResolvedAiCredential): boolean {
    return Boolean(this.getBaseUrl(credential));
  }

  getDefaultModel(credential?: ResolvedAiCredential): string {
    return (
      credential?.model ??
      this.configService.get('AI_OLLAMA_MODEL', { infer: true })
    );
  }

  async *streamChatCompletion(
    options: AiChatCompletionOptions,
    credential?: ResolvedAiCredential,
  ): AsyncIterable<AiChatStreamChunk> {
    const baseUrl = this.getBaseUrl(credential);
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

  async embed(
    text: string,
    credential?: ResolvedAiCredential,
  ): Promise<AiEmbeddingResult> {
    const baseUrl = this.getBaseUrl(credential);
    if (!baseUrl) throw new AiProviderNotConfiguredError(this.name);

    const response = await fetch(
      `${baseUrl.replace(/\/$/, '')}/api/embeddings`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.getDefaultModel(credential),
          prompt: text,
        }),
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
