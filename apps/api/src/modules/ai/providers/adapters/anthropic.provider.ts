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
import { parseSseEventStream } from './sse-stream.util.js';

const MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

/// Anthropic's Messages API has no `system` role message in the `messages`
/// array — the system prompt is a separate top-level field. This adapter
/// hoists any leading `system`-role message(s) out of the array
/// accordingly; it has no embeddings endpoint (AiMemoryService always uses
/// a dedicated embedding provider, never assumes the chat provider
/// doubles as one — see ai-provider.interface.ts).
@Injectable()
export class AnthropicProvider implements AiProvider {
  readonly name = 'ANTHROPIC' as const;

  constructor(private readonly configService: ConfigService<EnvConfig, true>) {}

  private getApiKey(credential?: ResolvedAiCredential): string | undefined {
    return (
      credential?.apiKey ??
      this.configService.get('AI_ANTHROPIC_API_KEY', { infer: true })
    );
  }

  isConfigured(credential?: ResolvedAiCredential): boolean {
    return Boolean(this.getApiKey(credential));
  }

  getDefaultModel(credential?: ResolvedAiCredential): string {
    return (
      credential?.model ??
      this.configService.get('AI_ANTHROPIC_MODEL', { infer: true })
    );
  }

  async *streamChatCompletion(
    options: AiChatCompletionOptions,
    credential?: ResolvedAiCredential,
  ): AsyncIterable<AiChatStreamChunk> {
    const apiKey = this.getApiKey(credential);
    if (!apiKey) throw new AiProviderNotConfiguredError(this.name);

    const systemPrompt = options.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const conversationMessages = options.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      }));

    const response = await fetch(MESSAGES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      signal: options.signal,
      body: JSON.stringify({
        model: options.model,
        system: systemPrompt || undefined,
        messages: conversationMessages,
        max_tokens: options.maxTokens,
        temperature: options.temperature ?? 0.2,
        stream: true,
      }),
    });

    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '');
      throw new AiProviderRequestError(
        this.name,
        `Anthropic request failed (${response.status}): ${text}`,
      );
    }

    let promptTokens: number | undefined;
    for await (const frame of parseSseEventStream(response.body)) {
      try {
        const parsed = JSON.parse(frame.data) as {
          type: string;
          delta?: { type?: string; text?: string };
          message?: { usage?: { input_tokens?: number } };
          usage?: { output_tokens?: number };
        };
        if (parsed.type === 'message_start') {
          promptTokens = parsed.message?.usage?.input_tokens;
        } else if (
          parsed.type === 'content_block_delta' &&
          parsed.delta?.text
        ) {
          yield { delta: parsed.delta.text };
        } else if (parsed.type === 'message_delta') {
          // carries cumulative output_tokens on the final delta before message_stop
        } else if (parsed.type === 'message_stop') {
          yield { delta: '', done: true, promptTokens };
          return;
        }
      } catch {
        // Non-JSON / ping frames are expected — ignore.
      }
    }
  }

  embed(): Promise<AiEmbeddingResult> {
    throw new AiProviderRequestError(
      this.name,
      'Anthropic has no embeddings API — use a different AI_EMBEDDING provider for RAG.',
    );
  }
}
