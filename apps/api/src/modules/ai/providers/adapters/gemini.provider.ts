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

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

/// Gemini has no `system` role in `contents` — like Anthropic, a leading
/// system message is hoisted into the separate `systemInstruction` field.
/// `role: 'model'` is Gemini's name for what every other provider calls
/// `assistant`.
@Injectable()
export class GeminiProvider implements AiProvider {
  readonly name = 'GEMINI' as const;

  constructor(private readonly configService: ConfigService<EnvConfig, true>) {}

  private getApiKey(credential?: ResolvedAiCredential): string | undefined {
    return (
      credential?.apiKey ??
      this.configService.get('AI_GEMINI_API_KEY', { infer: true })
    );
  }

  isConfigured(credential?: ResolvedAiCredential): boolean {
    return Boolean(this.getApiKey(credential));
  }

  getDefaultModel(credential?: ResolvedAiCredential): string {
    return (
      credential?.model ??
      this.configService.get('AI_GEMINI_MODEL', { infer: true })
    );
  }

  async *streamChatCompletion(
    options: AiChatCompletionOptions,
    credential?: ResolvedAiCredential,
  ): AsyncIterable<AiChatStreamChunk> {
    const apiKey = this.getApiKey(credential);
    if (!apiKey) throw new AiProviderNotConfiguredError(this.name);

    const systemInstruction = options.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const contents = options.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const url = `${BASE_URL}/models/${options.model}:streamGenerateContent?alt=sse&key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: options.signal,
      body: JSON.stringify({
        contents,
        systemInstruction: systemInstruction
          ? { parts: [{ text: systemInstruction }] }
          : undefined,
        generationConfig: {
          maxOutputTokens: options.maxTokens,
          temperature: options.temperature ?? 0.2,
        },
      }),
    });

    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '');
      throw new AiProviderRequestError(
        this.name,
        `Gemini request failed (${response.status}): ${text}`,
      );
    }

    for await (const frame of parseSseTextStream(response.body)) {
      try {
        const parsed = JSON.parse(frame) as {
          candidates?: {
            content?: { parts?: { text?: string }[] };
            finishReason?: string | null;
          }[];
          usageMetadata?: {
            promptTokenCount?: number;
            candidatesTokenCount?: number;
          };
        };
        const text =
          parsed.candidates?.[0]?.content?.parts
            ?.map((p) => p.text ?? '')
            .join('') ?? '';
        if (text) yield { delta: text };
        if (parsed.candidates?.[0]?.finishReason) {
          yield {
            delta: '',
            done: true,
            promptTokens: parsed.usageMetadata?.promptTokenCount,
            completionTokens: parsed.usageMetadata?.candidatesTokenCount,
          };
          return;
        }
      } catch {
        // Ignore non-JSON keep-alive frames.
      }
    }
    yield { delta: '', done: true };
  }

  async embed(
    text: string,
    credential?: ResolvedAiCredential,
  ): Promise<AiEmbeddingResult> {
    const apiKey = this.getApiKey(credential);
    if (!apiKey) throw new AiProviderNotConfiguredError(this.name);

    // text-embedding-004 was retired by Google (404s on v1beta as of 2026);
    // gemini-embedding-001 is its GA successor. It defaults to 3072
    // dimensions, so outputDimensionality truncates it to 1536 to match the
    // `vector(1536)` column in ai_memory_chunks (see
    // prisma-ai-memory.repository.ts). No manual re-normalization needed:
    // pgvector's `<=>` operator computes true cosine distance from the raw
    // values regardless of vector magnitude.
    const url = `${BASE_URL}/models/gemini-embedding-001:embedContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        outputDimensionality: 1536,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new AiProviderRequestError(
        this.name,
        `Gemini embeddings request failed (${response.status}): ${body}`,
      );
    }

    const data = (await response.json()) as {
      embedding?: { values?: number[] };
    };
    const embedding = data.embedding?.values ?? [];
    return { embedding, dimensions: embedding.length };
  }
}
