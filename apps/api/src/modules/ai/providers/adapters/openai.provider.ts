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

const CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';
const EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';

@Injectable()
export class OpenAiProvider implements AiProvider {
  readonly name = 'OPENAI' as const;

  constructor(private readonly configService: ConfigService<EnvConfig, true>) {}

  /// BYOK override (`credential.apiKey`) wins over the operator's server
  /// env var when present — see ResolvedAiCredential's doc comment.
  private getApiKey(credential?: ResolvedAiCredential): string | undefined {
    return (
      credential?.apiKey ??
      this.configService.get('AI_OPENAI_API_KEY', { infer: true })
    );
  }

  isConfigured(credential?: ResolvedAiCredential): boolean {
    return Boolean(this.getApiKey(credential));
  }

  getDefaultModel(credential?: ResolvedAiCredential): string {
    return (
      credential?.model ??
      this.configService.get('AI_OPENAI_MODEL', { infer: true })
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
        `OpenAI request failed (${response.status}): ${text}`,
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
        const finished = Boolean(parsed.choices?.[0]?.finish_reason);
        if (delta) yield { delta };
        if (finished) {
          yield {
            delta: '',
            done: true,
            promptTokens: parsed.usage?.prompt_tokens,
            completionTokens: parsed.usage?.completion_tokens,
          };
          return;
        }
      } catch {
        // Non-JSON keep-alive frames are expected on some SSE streams — ignore.
      }
    }
  }

  async embed(
    text: string,
    credential?: ResolvedAiCredential,
  ): Promise<AiEmbeddingResult> {
    const apiKey = this.getApiKey(credential);
    if (!apiKey) throw new AiProviderNotConfiguredError(this.name);

    const model = this.configService.get('AI_OPENAI_EMBEDDING_MODEL', {
      infer: true,
    });
    const response = await fetch(EMBEDDINGS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, input: text }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new AiProviderRequestError(
        this.name,
        `OpenAI embeddings request failed (${response.status}): ${body}`,
      );
    }

    const data = (await response.json()) as { data: { embedding: number[] }[] };
    const embedding = data.data[0]?.embedding ?? [];
    return { embedding, dimensions: embedding.length };
  }
}
