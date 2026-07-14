import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AiProviderName } from '@pentesthub/shared';
import { AI_PROVIDER_NAMES } from '@pentesthub/shared';
import type { EnvConfig } from '../../../config/env.validation.js';
import { AiProviderNotConfiguredError } from './ai-provider.interface.js';
import type { AiProvider } from './ai-provider.interface.js';
import { OpenAiProvider } from './adapters/openai.provider.js';
import { AnthropicProvider } from './adapters/anthropic.provider.js';
import { GeminiProvider } from './adapters/gemini.provider.js';
import { OllamaProvider } from './adapters/ollama.provider.js';
import { OpenRouterProvider } from './adapters/openrouter.provider.js';

export interface AiProviderStatus {
  provider: AiProviderName;
  configured: boolean;
  defaultModel: string | null;
}

/// The single seam "changing providers must only require configuration"
/// runs through — every command/query/service that needs to talk to an
/// LLM asks this registry for a provider by name (or for the configured
/// default), never imports a concrete adapter directly. Adding a 6th
/// provider later means writing one new adapter class and adding it to
/// the `providers` map in the constructor — nothing else in the AI module
/// changes.
@Injectable()
export class AiProviderRegistryService {
  private readonly providers: Map<AiProviderName, AiProvider>;

  constructor(
    private readonly configService: ConfigService<EnvConfig, true>,
    openAiProvider: OpenAiProvider,
    anthropicProvider: AnthropicProvider,
    geminiProvider: GeminiProvider,
    ollamaProvider: OllamaProvider,
    openRouterProvider: OpenRouterProvider,
  ) {
    this.providers = new Map<AiProviderName, AiProvider>([
      ['OPENAI', openAiProvider],
      ['ANTHROPIC', anthropicProvider],
      ['GEMINI', geminiProvider],
      ['OLLAMA', ollamaProvider],
      ['OPENROUTER', openRouterProvider],
    ]);
  }

  get(name: AiProviderName): AiProvider {
    const provider = this.providers.get(name);
    if (!provider) throw new Error(`Unknown AI provider "${name}"`);
    return provider;
  }

  getConfiguredOrThrow(name: AiProviderName): AiProvider {
    const provider = this.get(name);
    if (!provider.isConfigured()) throw new AiProviderNotConfiguredError(name);
    return provider;
  }

  getDefaultProviderName(): AiProviderName {
    return this.configService.get('AI_DEFAULT_PROVIDER', { infer: true });
  }

  /// Resolves the provider to use for a turn: an explicit per-conversation
  /// choice if one was made and is still configured, else the configured
  /// default, else the first provider that happens to be configured (so a
  /// deployment that only ever set up e.g. Ollama still works without the
  /// caller having to know that).
  resolveProvider(preferred?: AiProviderName | null): AiProvider {
    if (preferred) {
      const provider = this.get(preferred);
      if (provider.isConfigured()) return provider;
    }
    const defaultProvider = this.get(this.getDefaultProviderName());
    if (defaultProvider.isConfigured()) return defaultProvider;

    const fallback = [...this.providers.values()].find((p) => p.isConfigured());
    if (fallback) return fallback;

    throw new AiProviderNotConfiguredError(
      preferred ?? this.getDefaultProviderName(),
    );
  }

  /// Anthropic and OpenRouter have no embeddings API (see their adapters'
  /// `embed()`), so RAG always resolves a *separate* embedding-capable
  /// provider rather than assuming "the chat provider" doubles as one.
  /// Tries OpenAI first (matches the 1536-dim column the migration
  /// hard-codes — see env.validation.ts AI_EMBEDDING_DIMENSIONS comment),
  /// then Gemini, then a local Ollama embedding model.
  resolveEmbeddingProvider(): AiProvider {
    const candidates: AiProviderName[] = ['OPENAI', 'GEMINI', 'OLLAMA'];
    const configured = candidates
      .map((name) => this.get(name))
      .find((p) => p.isConfigured());
    if (!configured) throw new AiProviderNotConfiguredError('OPENAI');
    return configured;
  }

  listStatuses(): AiProviderStatus[] {
    return AI_PROVIDER_NAMES.map((name) => {
      const provider = this.get(name);
      return {
        provider: name,
        configured: provider.isConfigured(),
        defaultModel: provider.isConfigured()
          ? provider.getDefaultModel()
          : null,
      };
    });
  }
}
