import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AiMemorySourceType } from '@pentesthub/shared';
import type { EnvConfig } from '../../../config/env.validation.js';
import {
  AI_MEMORY_REPOSITORY,
  type AiMemoryRepository,
  type AiMemorySearchResult,
} from '../domain/repositories/ai-memory.repository.interface.js';
import { AiProviderRegistryService } from '../providers/ai-provider-registry.service.js';
import { AiProviderNotConfiguredError } from '../providers/ai-provider.interface.js';
import type { ResolvedProvider } from '../providers/ai-provider-registry.service.js';
import { collectStreamedCompletion } from '../providers/collect-stream.util.js';
import { chunkText } from './chunking.util.js';

export interface IndexContentInput {
  workspaceId: string;
  projectId: string | null;
  sourceType: AiMemorySourceType;
  sourceId: string;
  content: string;
  metadata?: Record<string, unknown>;
  /// Module 11 — Long-Term Memory expiration policies. Days from now this
  /// content should stop being searchable; omitted or 0 falls back to
  /// AI_MEMORY_DEFAULT_TTL_DAYS (itself 0 = never expires by default).
  /// Ephemeral content an agent produces mid-run is the main intended
  /// caller of this — a Finding/Note/Report indexed by its own module
  /// should keep the "never expires" default, since those records are
  /// meant to be permanently recallable.
  ttlDays?: number;
}

/// The RAG layer's public API: chunk + embed + store on write, embed +
/// similarity-search on read. Workspace/project isolation (Security:
/// Workspace Isolation) is enforced at the repository boundary — every
/// search call requires workspaceId, so a bug here can leak across
/// projects within one workspace at worst, never across workspaces.
/// resolveEmbeddingProvider is BYOK-aware (Local-First Migration Phase 1)
/// — a workspace's own OpenAI/Gemini/Ollama credential is preferred over
/// the operator's server-configured one, same as the chat path.
@Injectable()
export class AiMemoryService {
  private readonly logger = new Logger(AiMemoryService.name);

  constructor(
    @Inject(AI_MEMORY_REPOSITORY)
    private readonly memoryRepository: AiMemoryRepository,
    private readonly providerRegistry: AiProviderRegistryService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  /// Chunks + embeds + stores one piece of content (a finding description,
  /// a note, a recon result, etc). Silently no-ops (logging a warning)
  /// when no embedding provider is configured, rather than failing the
  /// caller's write — indexing is best-effort enrichment, never a
  /// requirement for the underlying record (a Finding/Note) to exist.
  async indexContent(input: IndexContentInput): Promise<void> {
    let resolved: ResolvedProvider;
    try {
      resolved = await this.providerRegistry.resolveEmbeddingProvider(
        input.workspaceId,
      );
    } catch (error) {
      if (error instanceof AiProviderNotConfiguredError) {
        this.logger.warn(
          `Skipping RAG indexing for ${input.sourceType}:${input.sourceId} — no embedding provider configured.`,
        );
        return;
      }
      throw error;
    }
    const { provider: embeddingProvider, credential } = resolved;

    const chunkSize = this.configService.get('AI_MEMORY_CHUNK_SIZE', {
      infer: true,
    });
    const overlap = this.configService.get('AI_MEMORY_CHUNK_OVERLAP', {
      infer: true,
    });
    const textChunks = chunkText(input.content, chunkSize, overlap);
    if (textChunks.length === 0) return;

    await this.memoryRepository.deleteBySource(
      input.sourceType,
      input.sourceId,
    );

    const ttlDays =
      input.ttlDays ??
      this.configService.get('AI_MEMORY_DEFAULT_TTL_DAYS', { infer: true });
    const expiresAt =
      ttlDays > 0 ? new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000) : null;

    const embedded = await Promise.all(
      textChunks.map(async (chunk, index) => {
        const { embedding } = await embeddingProvider.embed(chunk, credential);
        return {
          workspaceId: input.workspaceId,
          projectId: input.projectId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          chunkIndex: index,
          content: chunk,
          embedding,
          metadata: input.metadata,
          expiresAt,
        };
      }),
    );
    await this.memoryRepository.upsertChunks(embedded);
  }

  /// Semantic search (Semantic Search / Similarity Search) — used both by
  /// AiChatService to enrich the system prompt per-turn and by the
  /// search_* tools for on-demand lookups.
  async search(
    workspaceId: string,
    query: string,
    options?: {
      projectId?: string;
      sourceType?: AiMemorySourceType;
      topK?: number;
    },
  ): Promise<AiMemorySearchResult[]> {
    let resolved: ResolvedProvider;
    try {
      resolved = await this.providerRegistry.resolveEmbeddingProvider(workspaceId);
    } catch (error) {
      if (error instanceof AiProviderNotConfiguredError) return [];
      throw error;
    }
    const { provider: embeddingProvider, credential } = resolved;

    const { embedding } = await embeddingProvider.embed(query, credential);
    const defaultTopK = this.configService.get('AI_MEMORY_SEARCH_TOP_K', {
      infer: true,
    });
    const topK = options?.topK ?? defaultTopK;
    return this.memoryRepository.search(embedding, {
      workspaceId,
      projectId: options?.projectId,
      sourceType: options?.sourceType,
      topK,
    });
  }

  async removeProjectMemory(projectId: string): Promise<void> {
    await this.memoryRepository.deleteByProject(projectId);
  }

  /// Module 16 — AI Memory / researcher memory (task #397). Thin
  /// pass-through so callers outside this module (ResearcherMemoryService)
  /// can remove a single source's chunks on explicit user deletion without
  /// reaching past this service into the repository directly — keeps
  /// `AI_MEMORY_REPOSITORY`'s pgvector persistence boundary exactly where
  /// its own doc comment says it should stay (see
  /// ai-memory.repository.interface.ts).
  async deindexContent(sourceType: AiMemorySourceType, sourceId: string): Promise<void> {
    await this.memoryRepository.deleteBySource(sourceType, sourceId);
  }

  /// Module 11 — Long-Term Memory's Summarization requirement: condenses a
  /// set of retrieved memory chunks (typically this method's own caller
  /// having just called `search`) into a short prose brief, for callers
  /// that need to fit a lot of retrieved context into a small prompt
  /// budget (e.g. an agent recalling several past OrchestrationRuns)
  /// rather than concatenating every chunk verbatim. Falls back to a
  /// plain concatenation (still bounded in length) if no chat-capable
  /// provider is configured — summarization is an optimization, never a
  /// hard requirement for the caller to get *some* context back.
  async summarizeResults(
    workspaceId: string,
    query: string,
    results: AiMemorySearchResult[],
  ): Promise<string> {
    if (results.length === 0) return '';
    const joined = results
      .map((r) => `[${r.sourceType}] ${r.content}`)
      .join('\n\n');

    try {
      const { provider, credential } = await this.providerRegistry.resolveProvider(
        workspaceId,
      );
      const model = provider.getDefaultModel(credential);
      const text = await collectStreamedCompletion(
        provider,
        {
          model,
          maxTokens: 512,
          temperature: 0.2,
          messages: [
            {
              role: 'system',
              content:
                'Summarize the following retrieved memory excerpts into a short, dense brief (3-6 sentences) relevant to the query below. Preserve concrete facts (IDs, names, values) over prose. Respond with ONLY the summary text, no preamble.',
            },
            { role: 'user', content: `Query: ${query}\n\nExcerpts:\n${joined}` },
          ],
        },
        credential,
      );
      return text.trim();
    } catch (error) {
      this.logger.warn(`Memory summarization fell back to raw excerpts: ${String(error)}`);
      return joined.length > 2000 ? `${joined.slice(0, 2000)}...` : joined;
    }
  }

  /// Module 11 — Long-Term Memory's expiration-policy sweep. Intended to
  /// be called from a scheduled job (mirroring the webhook delivery
  /// queue's own poll-and-sweep pattern) rather than per-request; exposed
  /// here as a plain method so task #236's module wiring can attach it to
  /// whatever scheduler the platform already uses without this service
  /// needing to know about cron/queues itself.
  async sweepExpiredMemory(): Promise<number> {
    const deleted = await this.memoryRepository.deleteExpired();
    if (deleted > 0) {
      this.logger.log(`Swept ${deleted} expired AI memory chunk(s).`);
    }
    return deleted;
  }
}
