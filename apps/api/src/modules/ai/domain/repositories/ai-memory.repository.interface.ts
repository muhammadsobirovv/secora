import type { AiMemorySourceType } from '@pentesthub/shared';

export interface AiMemoryChunkInput {
  workspaceId: string;
  projectId: string | null;
  sourceType: AiMemorySourceType;
  sourceId: string;
  chunkIndex: number;
  content: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
  /// Module 11 — Long-Term Memory expiration policies. Null (the default)
  /// means "never expires", matching every pre-Module-11 caller's existing
  /// behavior unchanged.
  expiresAt?: Date | null;
}

export interface AiMemorySearchResult {
  id: string;
  content: string;
  sourceType: AiMemorySourceType;
  sourceId: string;
  /// Cosine similarity, 0..1 (1 = identical direction) — converted from
  /// pgvector's `<=>` cosine *distance* operator (`1 - distance`) so
  /// callers work with an intuitive "higher is better" score.
  score: number;
}

export interface AiMemorySearchFilter {
  workspaceId: string;
  projectId?: string;
  sourceType?: AiMemorySourceType;
  topK: number;
}

/// The RAG store's persistence boundary. `embedding` never appears as a
/// plain Prisma field anywhere in this interface's inputs/outputs on
/// purpose — every method that touches it works in terms of `number[]`,
/// and the Prisma implementation is solely responsible for the
/// $queryRaw/$executeRaw pgvector plumbing (see
/// PrismaAiMemoryRepository) — no other file in the codebase should ever
/// need to know pgvector's wire format.
export interface AiMemoryRepository {
  upsertChunks(chunks: AiMemoryChunkInput[]): Promise<void>;
  /// `search`'s query already excludes any chunk whose `expiresAt` has
  /// passed (Long-Term Memory expiration policies) — no caller needs to
  /// filter that out itself.
  search(
    queryEmbedding: number[],
    filter: AiMemorySearchFilter,
  ): Promise<AiMemorySearchResult[]>;
  deleteBySource(
    sourceType: AiMemorySourceType,
    sourceId: string,
  ): Promise<void>;
  deleteByProject(projectId: string): Promise<void>;
  /// Module 11 — the expiration-policy sweep: permanently removes every
  /// chunk whose `expiresAt` has passed. Returns the count deleted, purely
  /// for logging/observability at the call site.
  deleteExpired(): Promise<number>;
}

export const AI_MEMORY_REPOSITORY = Symbol('AI_MEMORY_REPOSITORY');
