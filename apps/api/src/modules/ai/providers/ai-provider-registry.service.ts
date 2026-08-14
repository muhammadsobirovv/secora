import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AiPrivacyMode, AiProviderMarketplaceEntryDto, AiProviderName } from '@pentesthub/shared';
import { AI_PROVIDER_MARKETPLACE, AI_PROVIDER_NAMES, LOCAL_AI_PROVIDER_NAMES } from '@pentesthub/shared';
import type { EnvConfig } from '../../../config/env.validation.js';
import { decryptCredential } from '../../../common/utils/credential-encryption.util.js';
import {
  AI_PROVIDER_CREDENTIALS_REPOSITORY,
  type AiProviderCredentialsRepository,
} from '../domain/repositories/ai-provider-credentials.repository.interface.js';
import { AiPrivacyModeViolationError, AiProviderNotConfiguredError } from './ai-provider.interface.js';
import type { AiProvider, ResolvedAiCredential } from './ai-provider.interface.js';
import { OpenAiProvider } from './adapters/openai.provider.js';
import { AnthropicProvider } from './adapters/anthropic.provider.js';
import { GeminiProvider } from './adapters/gemini.provider.js';
import { OllamaProvider } from './adapters/ollama.provider.js';
import { OpenRouterProvider } from './adapters/openrouter.provider.js';
import { AiPrivacyModeService } from './ai-privacy-mode.service.js';

export interface AiProviderStatus {
  provider: AiProviderName;
  configured: boolean;
  defaultModel: string | null;
  /// Local-First Migration Phase 1 (BYOK) — true when this workspace has
  /// its own credential for this provider (as opposed to falling back to
  /// the operator's server-configured key, or being unconfigured
  /// entirely). Lets the frontend show "using your key" vs "using the
  /// shared server key" vs "not configured".
  byok: boolean;
  /// Module 11 — Privacy controls (task #234). See AiProviderStatusDto's
  /// matching field in packages/shared/src/ai.ts.
  allowedByPrivacyMode: boolean;
}

export interface ResolvedProvider {
  provider: AiProvider;
  credential?: ResolvedAiCredential;
}

/// The single seam "changing providers must only require configuration"
/// runs through — every command/query/service that needs to talk to an
/// LLM asks this registry for a provider by name (or for the configured
/// default), never imports a concrete adapter directly. Adding a 6th
/// provider later means writing one new adapter class and adding it to
/// the `providers` map in the constructor — nothing else in the AI module
/// changes.
///
/// Local-First Migration Phase 1 (BYOK): every resolution method now
/// takes a `workspaceId` and first checks that workspace's own
/// AiProviderCredential before falling back to the operator's
/// server-configured env vars — see resolveCredential and
/// docs/adr/0007-local-first-desktop-agent-architecture.md.
@Injectable()
export class AiProviderRegistryService {
  private readonly providers: Map<AiProviderName, AiProvider>;

  constructor(
    private readonly configService: ConfigService<EnvConfig, true>,
    @Inject(AI_PROVIDER_CREDENTIALS_REPOSITORY)
    private readonly credentialsRepository: AiProviderCredentialsRepository,
    private readonly privacyModeService: AiPrivacyModeService,
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

  /// Looks up and decrypts this workspace's own credential for `provider`,
  /// if one exists. Returns undefined (never throws) when none is stored —
  /// every adapter method already falls back to its env-configured
  /// behavior when passed an undefined/partial credential, so "no BYOK
  /// credential" is never an error condition here, only upstream in
  /// isConfigured()/resolveProvider() if nothing at all is configured.
  async resolveCredential(
    provider: AiProviderName,
    workspaceId: string,
  ): Promise<ResolvedAiCredential | undefined> {
    const record = await this.credentialsRepository.findByWorkspaceAndProvider(
      workspaceId,
      provider,
    );
    if (!record) return undefined;

    const encryptionKey = this.configService.get('CREDENTIAL_ENCRYPTION_KEY', {
      infer: true,
    });
    const apiKey = record.encryptedApiKey
      ? decryptCredential(record.encryptedApiKey, encryptionKey)
      : undefined;

    return {
      apiKey,
      baseUrl: record.baseUrl ?? undefined,
      model: record.model ?? undefined,
    };
  }

  getConfiguredOrThrow(
    name: AiProviderName,
    credential?: ResolvedAiCredential,
  ): AiProvider {
    const provider = this.get(name);
    if (!provider.isConfigured(credential)) {
      throw new AiProviderNotConfiguredError(name);
    }
    return provider;
  }

  getDefaultProviderName(): AiProviderName {
    return this.configService.get('AI_DEFAULT_PROVIDER', { infer: true });
  }

  /// Module 11 — Privacy controls (task #234). `true` unless this
  /// workspace's AiPrivacyMode is LOCAL and `name` isn't one of
  /// LOCAL_AI_PROVIDER_NAMES — CLOUD and HYBRID never exclude a candidate
  /// here (HYBRID only *reorders* candidates to prefer local, via
  /// privacyCandidateOrder below; it still allows cloud fallback).
  private isProviderAllowed(name: AiProviderName, mode: AiPrivacyMode): boolean {
    if (mode !== 'LOCAL') return true;
    return (LOCAL_AI_PROVIDER_NAMES as readonly AiProviderName[]).includes(name);
  }

  /// HYBRID prefers local providers first, then falls back through the
  /// rest of AI_PROVIDER_NAMES in its normal order; CLOUD and LOCAL both
  /// just use the normal order (LOCAL's exclusion happens in
  /// isProviderAllowed, not here).
  private privacyCandidateOrder(mode: AiPrivacyMode): AiProviderName[] {
    if (mode !== 'HYBRID') return AI_PROVIDER_NAMES;
    const local = LOCAL_AI_PROVIDER_NAMES;
    const rest = AI_PROVIDER_NAMES.filter((n) => !(local as readonly AiProviderName[]).includes(n));
    return [...local, ...rest];
  }

  /// Resolves the provider to use for a turn: an explicit per-conversation
  /// choice if one was made and is configured (BYOK or server env), else
  /// the configured default, else the first provider that happens to be
  /// configured (so a deployment/workspace that only ever set up e.g.
  /// Ollama still works without the caller having to know that) — always
  /// checking this workspace's own BYOK credential first at each step.
  ///
  /// Module 11 — Privacy controls (task #234): every candidate is first
  /// filtered through this workspace's AiPrivacyMode (see
  /// AiPrivacyModeService.resolveMode) — an explicit `preferred` choice
  /// that isn't allowed under LOCAL mode throws AiPrivacyModeViolationError
  /// immediately, rather than silently falling through to a cloud provider
  /// the workspace opted out of.
  async resolveProvider(
    workspaceId: string,
    preferred?: AiProviderName | null,
  ): Promise<ResolvedProvider> {
    const mode = await this.privacyModeService.resolveMode(workspaceId);

    if (preferred) {
      if (!this.isProviderAllowed(preferred, mode)) {
        throw new AiPrivacyModeViolationError(preferred, 'LOCAL');
      }
      const provider = this.get(preferred);
      const credential = await this.resolveCredential(preferred, workspaceId);
      if (provider.isConfigured(credential)) return { provider, credential };
    }

    const defaultName = this.getDefaultProviderName();
    if (this.isProviderAllowed(defaultName, mode)) {
      const defaultProvider = this.get(defaultName);
      const defaultCredential = await this.resolveCredential(
        defaultName,
        workspaceId,
      );
      if (defaultProvider.isConfigured(defaultCredential)) {
        return { provider: defaultProvider, credential: defaultCredential };
      }
    }

    for (const name of this.privacyCandidateOrder(mode)) {
      if (!this.isProviderAllowed(name, mode)) continue;
      const provider = this.get(name);
      const credential = await this.resolveCredential(name, workspaceId);
      if (provider.isConfigured(credential)) return { provider, credential };
    }

    if (mode === 'LOCAL') {
      throw new AiPrivacyModeViolationError(preferred ?? defaultName, 'LOCAL');
    }
    throw new AiProviderNotConfiguredError(preferred ?? defaultName);
  }

  /// Anthropic and OpenRouter have no embeddings API (see their adapters'
  /// `embed()`), so RAG always resolves a *separate* embedding-capable
  /// provider rather than assuming "the chat provider" doubles as one.
  /// Tries OpenAI first (matches the 1536-dim column the migration
  /// hard-codes — see env.validation.ts AI_EMBEDDING_DIMENSIONS comment),
  /// then Gemini, then a local Ollama embedding model — BYOK-aware at
  /// each step, same as resolveProvider.
  ///
  /// Module 11 — Privacy controls (task #234): under LOCAL mode this only
  /// ever tries OLLAMA — a LOCAL workspace's memory embeddings must not
  /// silently leave the workspace via a cloud embeddings API either.
  async resolveEmbeddingProvider(workspaceId: string): Promise<ResolvedProvider> {
    const mode = await this.privacyModeService.resolveMode(workspaceId);
    const allCandidates: AiProviderName[] = ['OPENAI', 'GEMINI', 'OLLAMA'];
    const candidates = allCandidates.filter((name) => this.isProviderAllowed(name, mode));
    for (const name of candidates) {
      const provider = this.get(name);
      const credential = await this.resolveCredential(name, workspaceId);
      if (provider.isConfigured(credential)) return { provider, credential };
    }
    if (mode === 'LOCAL') {
      throw new AiPrivacyModeViolationError('OLLAMA', 'LOCAL');
    }
    throw new AiProviderNotConfiguredError('OPENAI');
  }

  async listStatuses(workspaceId: string): Promise<AiProviderStatus[]> {
    const mode = await this.privacyModeService.resolveMode(workspaceId);
    const results: AiProviderStatus[] = [];
    for (const name of AI_PROVIDER_NAMES) {
      const provider = this.get(name);
      const credential = await this.resolveCredential(name, workspaceId);
      const configured = provider.isConfigured(credential);
      results.push({
        provider: name,
        configured,
        defaultModel: configured ? provider.getDefaultModel(credential) : null,
        byok: Boolean(credential?.apiKey || credential?.baseUrl),
        allowedByPrivacyMode: this.isProviderAllowed(name, mode),
      });
    }
    return results;
  }

  /// Module 15 — AI provider marketplace (BYOK expansion, task #341).
  /// Merges the static AI_PROVIDER_MARKETPLACE catalog with this
  /// workspace's live status (same underlying data listStatuses already
  /// computes) — one request gets both "what is this provider, how do I
  /// set it up" and "is it already configured for my workspace."
  async listMarketplace(workspaceId: string): Promise<AiProviderMarketplaceEntryDto[]> {
    const statuses = await this.listStatuses(workspaceId);
    const statusByProvider = new Map(statuses.map((status) => [status.provider, status]));
    return AI_PROVIDER_MARKETPLACE.map((entry) => {
      const status = statusByProvider.get(entry.provider);
      return {
        ...entry,
        configured: status?.configured ?? false,
        defaultModel: status?.defaultModel ?? null,
        byok: status?.byok ?? false,
        allowedByPrivacyMode: status?.allowedByPrivacyMode ?? true,
      };
    });
  }
}
