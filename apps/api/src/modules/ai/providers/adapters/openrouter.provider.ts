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
import { parseSseTextStream } from './sse-stream.util.js';

const CHAT_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions';

/// OpenRouter exposes an OpenAI-compatible Chat Completions API in front
/// of many upstream model providers — same wire format as OpenAiProvider,
/// different base URL/auth header and no first-party embeddings endpoint
/// (routes chat only; RAG always uses a dedicated embedding provider).
@Injectable()
export class OpenRouterProvider implements AiProvider {
  readonly name = 'OPENROUTER' as const;

  constructor(private readonly configService: ConfigService<EnvConfig, true>) {}

  private getApiKey(credential?: ResolvedAiCredential): string | undefined {
    return (
      credential?.apiKey ??
      this.configService.get('AI_OPENROUTER_API_KEY', { infer: true })
    );
  }

  isConfigured(credential?: ResolvedAiCredential): boolean {
    return Boolean(this.getApiKey(credential));
  }

  getDefaultModel(credential?: ResolvedAiCredential): string {
    return (
      credential?.model ??
      this.configService.get('AI_OPENROUTER_MODEL', { infer: true })
    );
  }

  async *streamChatCompletion(
    options: AiChatCompletionOptions,
    credential?: ResolvedAiCredential,
  ): AsyncIterable<AiChatStreamChunk> {
    const apiKey = this.getApiKey(credential);
    if (!apiKey) throw new AiProviderNotConfiguredError(this.name);

    const response = await fetch(CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://secora.group',
        'X-Title': 'Secora AI',
      },
      signal: options.signal,
      body: JSON.stringify({
        model: options.model,
        messages: options.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        max_tokens: options.maxTokens,
        temperature: options.temperature ?? 0.2,
        stream: true,
      }),
    });

    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '');
      throw new AiProviderRequestError(
        this.name,
        `OpenRouter request failed (${response.status}): ${text}`,
      );
    }

    for await (const frame of parseSseTextStream(response.body)) {
      if (frame === '[DONE]') {
        yield { delta: '', done: true };
        return;
      }
      try {
        const parsed = JSON.parse(frame) as {
          choices?: {
            delta?: { content?: string };
            finish_reason?: string | null;
          }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const delta = parsed.choices?.[0]?.delta?.content ?? '';
        if (delta) yield { delta };
        if (parsed.choices?.[0]?.finish_reason) {
          yield {
            delta: '',
            done: true,
            promptTokens: parsed.usage?.prompt_tokens,
            completionTokens: parsed.usage?.completion_tokens,
          };
          return;
        }
      } catch {
        // Ignore non-JSON keep-alive frames.
      }
    }
  }

  embed(): Promise<AiEmbeddingResult> {
    throw new AiProviderRequestError(
      this.name,
      'OpenRouter has no embeddings API — use a different AI_EMBEDDING provider for RAG.',
    );
  }
}
