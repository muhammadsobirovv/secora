import { describe, it, expect, jest } from '@jest/globals';
import type { AiProviderName } from '@pentesthub/shared';
import type { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../../config/env.validation.js';
import { AiPrivacyModeViolationError, AiProviderNotConfiguredError } from './ai-provider.interface.js';
import type { AiProvider } from './ai-provider.interface.js';
import { AiProviderRegistryService } from './ai-provider-registry.service.js';
import type { AiPrivacyModeService } from './ai-privacy-mode.service.js';
import type { AiProviderCredentialsRepository } from '../domain/repositories/ai-provider-credentials.repository.interface.js';
import type { OpenAiProvider } from './adapters/openai.provider.js';
import type { AnthropicProvider } from './adapters/anthropic.provider.js';
import type { GeminiProvider } from './adapters/gemini.provider.js';
import type { OllamaProvider } from './adapters/ollama.provider.js';
import type { OpenRouterProvider } from './adapters/openrouter.provider.js';

/// Module 11 — Privacy controls (task #234). This registry is the single
/// seam every AI/agent call resolves a provider through, so its privacy
/// enforcement (LOCAL throws rather than silently falling back to cloud;
/// HYBRID reorders the fallback loop but the default-provider shortcut
/// still wins if configured; CLOUD is unrestricted) is the highest-value
/// thing in the AI layer to pin down with tests — a regression here is a
/// silent data-exfiltration risk, not just a broken feature.
///
/// Supersedes the pre-Module-11 version of this spec: resolveProvider,
/// resolveEmbeddingProvider, and listStatuses all became async once they
/// started consulting AiPrivacyModeService.resolveMode, and the
/// constructor gained credentialsRepository + privacyModeService params —
/// see AiProviderRegistryService's own doc comments.
function fakeProvider(name: AiProviderName, configured: boolean): AiProvider {
  return {
    name,
    isConfigured: jest.fn().mockReturnValue(configured),
    getDefaultModel: jest.fn().mockReturnValue(`${name.toLowerCase()}-default-model`),
    streamChatCompletion: async function* () {
      await Promise.resolve();
      yield { delta: '', done: true };
    },
    embed: jest.fn(() => Promise.resolve({ embedding: [], dimensions: 0 })),
  } as unknown as AiProvider;
}

function buildRegistry(opts: {
  defaultProvider?: AiProviderName;
  configured?: Partial<Record<AiProviderName, boolean>>;
  privacyMode?: 'CLOUD' | 'LOCAL' | 'HYBRID';
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
    get: jest.fn((key: string) => {
      if (key === 'AI_DEFAULT_PROVIDER') return opts.defaultProvider ?? 'OPENAI';
      if (key === 'CREDENTIAL_ENCRYPTION_KEY') return 'test-key';
      return undefined;
    }),
  } as unknown as ConfigService<EnvConfig, true>;

  const credentialsRepository = {
    upsert: jest.fn(),
    findByWorkspaceAndProvider: jest.fn().mockResolvedValue(null),
    listByWorkspace: jest.fn(),
    delete: jest.fn(),
  } as unknown as AiProviderCredentialsRepository;

  const privacyModeService = {
    resolveMode: jest.fn().mockResolvedValue(opts.privacyMode ?? 'CLOUD'),
  } as unknown as AiPrivacyModeService;

  const providers = {
    OPENAI: fakeProvider('OPENAI', configured.OPENAI),
    ANTHROPIC: fakeProvider('ANTHROPIC', configured.ANTHROPIC),
    GEMINI: fakeProvider('GEMINI', configured.GEMINI),
    OLLAMA: fakeProvider('OLLAMA', configured.OLLAMA),
    OPENROUTER: fakeProvider('OPENROUTER', configured.OPENROUTER),
  };

  const registry = new AiProviderRegistryService(
    configService,
    credentialsRepository,
    privacyModeService,
    providers.OPENAI as unknown as OpenAiProvider,
    providers.ANTHROPIC as unknown as AnthropicProvider,
    providers.GEMINI as unknown as GeminiProvider,
    providers.OLLAMA as unknown as OllamaProvider,
    providers.OPENROUTER as unknown as OpenRouterProvider,
  );
  return { registry, configService, providers };
}

describe('AiProviderRegistryService', () => {
  it('get() returns the adapter for a known provider name', () => {
    const { registry } = buildRegistry({});
    expect(registry.get('ANTHROPIC').name).toBe('ANTHROPIC');
  });

  it('getConfiguredOrThrow() throws AiProviderNotConfiguredError for an unconfigured provider', () => {
    const { registry } = buildRegistry({ configured: { OPENAI: false } });
    expect(() => registry.getConfiguredOrThrow('OPENAI')).toThrow(AiProviderNotConfiguredError);
  });

  it('getConfiguredOrThrow() returns the adapter when it is configured', () => {
    const { registry } = buildRegistry({ configured: { OPENAI: true } });
    expect(registry.getConfiguredOrThrow('OPENAI').name).toBe('OPENAI');
  });

  describe('resolveProvider (CLOUD mode)', () => {
    it('prefers an explicit, configured choice', async () => {
      const { registry } = buildRegistry({
        defaultProvider: 'OPENAI',
        configured: { OPENAI: true, ANTHROPIC: true },
        privacyMode: 'CLOUD',
      });
      const result = await registry.resolveProvider('ws-1', 'ANTHROPIC');
      expect(result.provider.name).toBe('ANTHROPIC');
    });

    it('falls back to the configured default when the preferred provider is not configured', async () => {
      const { registry } = buildRegistry({
        defaultProvider: 'OPENAI',
        configured: { OPENAI: true, ANTHROPIC: false },
        privacyMode: 'CLOUD',
      });
      const result = await registry.resolveProvider('ws-1', 'ANTHROPIC');
      expect(result.provider.name).toBe('OPENAI');
    });

    it('falls back to any configured provider when neither preferred nor default is configured', async () => {
      const { registry } = buildRegistry({
        defaultProvider: 'OPENAI',
        configured: { OPENAI: false, OLLAMA: true },
        privacyMode: 'CLOUD',
      });
      const result = await registry.resolveProvider('ws-1', 'ANTHROPIC');
      expect(result.provider.name).toBe('OLLAMA');
    });

    it('throws AiProviderNotConfiguredError when nothing at all is configured', async () => {
      const { registry } = buildRegistry({ defaultProvider: 'OPENAI', configured: {}, privacyMode: 'CLOUD' });
      await expect(registry.resolveProvider('ws-1')).rejects.toThrow(AiProviderNotConfiguredError);
    });
  });

  describe('resolveProvider (LOCAL mode — task #234)', () => {
    it('throws AiPrivacyModeViolationError immediately for an explicit non-local preferred provider', async () => {
      const { registry } = buildRegistry({
        defaultProvider: 'OPENAI',
        configured: { OPENAI: true, OLLAMA: true },
        privacyMode: 'LOCAL',
      });
      await expect(registry.resolveProvider('ws-1', 'OPENAI')).rejects.toThrow(
        AiPrivacyModeViolationError,
      );
    });

    it('skips a configured but non-local default and falls through to a local provider', async () => {
      const { registry } = buildRegistry({
        defaultProvider: 'OPENAI',
        configured: { OPENAI: true, OLLAMA: true },
        privacyMode: 'LOCAL',
      });
      const result = await registry.resolveProvider('ws-1');
      expect(result.provider.name).toBe('OLLAMA');
    });

    it('throws AiPrivacyModeViolationError when no local provider is configured at all', async () => {
      const { registry } = buildRegistry({
        defaultProvider: 'OPENAI',
        configured: { OPENAI: true, OLLAMA: false },
        privacyMode: 'LOCAL',
      });
      await expect(registry.resolveProvider('ws-1')).rejects.toThrow(AiPrivacyModeViolationError);
    });
  });

  describe('resolveProvider (HYBRID mode — task #234)', () => {
    it('a configured default provider still wins over the local-first candidate order', async () => {
      // privacyCandidateOrder only reorders the *fallback* loop — the
      // default-provider shortcut runs first and is always allowed under
      // HYBRID, so a configured cloud default is returned even though
      // HYBRID conceptually "prefers" local providers.
      const { registry } = buildRegistry({
        defaultProvider: 'OPENAI',
        configured: { OPENAI: true, OLLAMA: true },
        privacyMode: 'HYBRID',
      });
      const result = await registry.resolveProvider('ws-1');
      expect(result.provider.name).toBe('OPENAI');
    });

    it('tries local providers first in the fallback loop when the default is not configured', async () => {
      const { registry } = buildRegistry({
        defaultProvider: 'OPENAI',
        // ANTHROPIC precedes OLLAMA in AI_PROVIDER_NAMES's normal order,
        // but privacyCandidateOrder puts LOCAL_AI_PROVIDER_NAMES first
        // under HYBRID.
        configured: { OPENAI: false, ANTHROPIC: true, OLLAMA: true },
        privacyMode: 'HYBRID',
      });
      const result = await registry.resolveProvider('ws-1');
      expect(result.provider.name).toBe('OLLAMA');
    });
  });

  describe('resolveEmbeddingProvider', () => {
    it('CLOUD mode tries OpenAI, then Gemini, then Ollama, never Anthropic/OpenRouter', async () => {
      const { registry } = buildRegistry({
        configured: { GEMINI: true, ANTHROPIC: true, OPENROUTER: true },
        privacyMode: 'CLOUD',
      });
      const result = await registry.resolveEmbeddingProvider('ws-1');
      expect(result.provider.name).toBe('GEMINI');
    });

    it('CLOUD mode throws when no embedding-capable provider is configured', async () => {
      const { registry } = buildRegistry({
        configured: { ANTHROPIC: true, OPENROUTER: true },
        privacyMode: 'CLOUD',
      });
      await expect(registry.resolveEmbeddingProvider('ws-1')).rejects.toThrow(
        AiProviderNotConfiguredError,
      );
    });

    it('LOCAL mode only ever tries OLLAMA', async () => {
      const { registry, providers } = buildRegistry({
        configured: { OPENAI: true, GEMINI: true, OLLAMA: true },
        privacyMode: 'LOCAL',
      });
      const result = await registry.resolveEmbeddingProvider('ws-1');
      expect(result.provider.name).toBe('OLLAMA');
      expect(providers.OPENAI.isConfigured).not.toHaveBeenCalled();
      expect(providers.GEMINI.isConfigured).not.toHaveBeenCalled();
    });

    it('LOCAL mode throws AiPrivacyModeViolationError when Ollama has no embeddings configured', async () => {
      const { registry } = buildRegistry({
        configured: { OPENAI: true, GEMINI: true, OLLAMA: false },
        privacyMode: 'LOCAL',
      });
      await expect(registry.resolveEmbeddingProvider('ws-1')).rejects.toThrow(
        AiPrivacyModeViolationError,
      );
    });
  });

  describe('listStatuses', () => {
    it('reports configured flag, default model, and allowedByPrivacyMode per provider (CLOUD)', async () => {
      const { registry } = buildRegistry({ configured: { OPENAI: true }, privacyMode: 'CLOUD' });
      const statuses = await registry.listStatuses('ws-1');
      expect(statuses).toHaveLength(5);
      const openai = statuses.find((s) => s.provider === 'OPENAI');
      expect(openai).toMatchObject({
        provider: 'OPENAI',
        configured: true,
        defaultModel: 'openai-default-model',
        allowedByPrivacyMode: true,
      });
      const anthropic = statuses.find((s) => s.provider === 'ANTHROPIC');
      expect(anthropic).toMatchObject({
        provider: 'ANTHROPIC',
        configured: false,
        defaultModel: null,
        allowedByPrivacyMode: true,
      });
    });

    it('LOCAL mode reports allowedByPrivacyMode=true only for OLLAMA', async () => {
      const { registry } = buildRegistry({ privacyMode: 'LOCAL' });
      const statuses = await registry.listStatuses('ws-1');
      const byName = new Map(statuses.map((s) => [s.provider, s.allowedByPrivacyMode]));
      expect(byName.get('OLLAMA')).toBe(true);
      expect(byName.get('OPENAI')).toBe(false);
      expect(byName.get('ANTHROPIC')).toBe(false);
      expect(byName.get('GEMINI')).toBe(false);
      expect(byName.get('OPENROUTER')).toBe(false);
    });
  });
});
