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
import { chunkText } from './chunking.util.js';

export interface IndexContentInput {
  workspaceId: string;
  projectId: string | null;
  sourceType: AiMemorySourceType;
  sourceId: string;
  content: string;
  metadata?: Record<string, unknown>;
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
}
