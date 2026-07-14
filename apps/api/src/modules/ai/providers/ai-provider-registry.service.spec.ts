import { describe, expect, it, jest } from '@jest/globals';
import type { AiProviderName } from '@pentesthub/shared';
import type { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../../config/env.validation.js';
import { AiProviderNotConfiguredError } from './ai-provider.interface.js';
import type { AiProvider } from './ai-provider.interface.js';
import { AiProviderRegistryService } from './ai-provider-registry.service.js';
import type { OpenAiProvider } from './adapters/openai.provider.js';
import type { AnthropicProvider } from './adapters/anthropic.provider.js';
import type { GeminiProvider } from './adapters/gemini.provider.js';
import type { OllamaProvider } from './adapters/ollama.provider.js';
import type { OpenRouterProvider } from './adapters/openrouter.provider.js';

function fakeProvider(name: AiProviderName, configured: boolean): AiProvider {
  return {
    name,
    isConfigured: () => configured,
    getDefaultModel: () => `${name.toLowerCase()}-default-model`,
    streamChatCompletion: async function* () {
      await Promise.resolve();
      yield { delta: '', done: true };
    },
    embed: () => Promise.resolve({ embedding: [], dimensions: 0 }),
  };
}

function buildRegistry(opts: {
  defaultProvider?: AiProviderName;
  configured?: Partial<Record<AiProviderName, boolean>>;
}) {
  const configured: Record<AiProviderName, boolean> = {
    OPENAI: false,
    ANTHROPIC: false,
    GEMINI: false,
    OLLAMA: false,
    OPENROUTER: false,
    ...opts.configured,
  };

  const configService = {
    get: jest.fn().mockReturnValue(opts.defaultProvider ?? 'OPENAI'),
  } as unknown as ConfigService<EnvConfig, true>;

  const registry = new AiProviderRegistryService(
    configService,
    fakeProvider('OPENAI', configured.OPENAI) as unknown as OpenAiProvider,
    fakeProvider(
      'ANTHROPIC',
      configured.ANTHROPIC,
    ) as unknown as AnthropicProvider,
    fakeProvider('GEMINI', configured.GEMINI) as unknown as GeminiProvider,
    fakeProvider('OLLAMA', configured.OLLAMA) as unknown as OllamaProvider,
    fakeProvider(
      'OPENROUTER',
      configured.OPENROUTER,
    ) as unknown as OpenRouterProvider,
  );
  return { registry, configService };
}

describe('AiProviderRegistryService', () => {
  it('get() returns the adapter for a known provider name', () => {
    const { registry } = buildRegistry({});
    expect(registry.get('ANTHROPIC').name).toBe('ANTHROPIC');
  });

  it('getConfiguredOrThrow() throws AiProviderNotConfiguredError for an unconfigured provider', () => {
    const { registry } = buildRegistry({ configured: { OPENAI: false } });
    expect(() => registry.getConfiguredOrThrow('OPENAI')).toThrow(
      AiProviderNotConfiguredError,
    );
  });

  it('getConfiguredOrThrow() returns the adapter when it is configured', () => {
    const { registry } = buildRegistry({ configured: { OPENAI: true } });
    expect(registry.getConfiguredOrThrow('OPENAI').name).toBe('OPENAI');
  });

  it('resolveProvider() prefers an explicit, configured choice', () => {
    const { registry } = buildRegistry({
      defaultProvider: 'OPENAI',
      configured: { OPENAI: true, ANTHROPIC: true },
    });
    expect(registry.resolveProvider('ANTHROPIC').name).toBe('ANTHROPIC');
  });

  it('resolveProvider() falls back to the configured default when the preferred provider is not configured', () => {
    const { registry } = buildRegistry({
      defaultProvider: 'OPENAI',
      configured: { OPENAI: true, ANTHROPIC: false },
    });
    expect(registry.resolveProvider('ANTHROPIC').name).toBe('OPENAI');
  });

  it('resolveProvider() falls back to any configured provider when neither preferred nor default is configured', () => {
    const { registry } = buildRegistry({
      defaultProvider: 'OPENAI',
      configured: { OPENAI: false, OLLAMA: true },
    });
    expect(registry.resolveProvider('ANTHROPIC').name).toBe('OLLAMA');
  });

  it('resolveProvider() throws when nothing at all is configured', () => {
    const { registry } = buildRegistry({
      defaultProvider: 'OPENAI',
      configured: {},
    });
    expect(() => registry.resolveProvider()).toThrow(
      AiProviderNotConfiguredError,
    );
  });

  it('resolveEmbeddingProvider() tries OpenAI, then Gemini, then Ollama, never Anthropic/OpenRouter', () => {
    const { registry } = buildRegistry({
      configured: { GEMINI: true, ANTHROPIC: true, OPENROUTER: true },
    });
    expect(registry.resolveEmbeddingProvider().name).toBe('GEMINI');
  });

  it('resolveEmbeddingProvider() throws when no embedding-capable provider is configured', () => {
    const { registry } = buildRegistry({
      configured: { ANTHROPIC: true, OPENROUTER: true },
    });
    expect(() => registry.resolveEmbeddingProvider()).toThrow(
      AiProviderNotConfiguredError,
    );
  });

  it('listStatuses() reports configured flag and default model per provider', () => {
    const { registry } = buildRegistry({ configured: { OPENAI: true } });
    const statuses = registry.listStatuses();
    expect(statuses).toHaveLength(5);
    const openai = statuses.find((s) => s.provider === 'OPENAI');
    expect(openai).toEqual({
      provider: 'OPENAI',
      configured: true,
      defaultModel: 'openai-default-model',
    });
    const anthropic = statuses.find((s) => s.provider === 'ANTHROPIC');
    expect(anthropic).toEqual({
      provider: 'ANTHROPIC',
      configured: false,
      defaultModel: null,
    });
  });
});
