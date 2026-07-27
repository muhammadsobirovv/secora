import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import { Prisma } from '../../../../../prisma-types.js';
import type {
  AiMemoryChunkInput,
  AiMemoryRepository,
  AiMemorySearchFilter,
  AiMemorySearchResult,
} from '../../../domain/repositories/ai-memory.repository.interface.js';
import type { AiMemorySourceType } from '@pentesthub/shared';

/// The RAG store's one raw-SQL boundary. `ai_memory_chunks.embedding` is a
/// pgvector column declared `Unsupported("vector(1536)")` in
/// schema.prisma, which Prisma Client excludes entirely from generated
/// create/select/update input for this model — every read/write of that
/// one column goes through $queryRaw/$executeRaw here; every other column
/// on this model *could* use the normal Client too, but is kept here as
/// raw SQL as well so one row's write is one round trip, not two.
@Injectable()
export class PrismaAiMemoryRepository implements AiMemoryRepository {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  /// Module 11 — Performance optimizations (task #235): one multi-row
  /// INSERT instead of one $executeRaw round-trip per chunk — indexContent
  /// calls this with every chunk a piece of content was split into, which
  /// for a long finding/report could previously mean dozens of sequential
  /// round-trips for a single indexing call.
  async upsertChunks(chunks: AiMemoryChunkInput[]): Promise<void> {
    if (chunks.length === 0) return;

    const rows = chunks.map((chunk) => {
      const vectorLiteral = toVectorLiteral(chunk.embedding);
      return Prisma.sql`(${randomUUID()}, ${chunk.workspaceId}, ${chunk.projectId}, ${chunk.sourceType}::"AiMemorySourceType", ${chunk.sourceId}, ${chunk.chunkIndex}, ${chunk.content}, ${vectorLiteral}::vector, ${chunk.metadata ? JSON.stringify(chunk.metadata) : null}::jsonb, ${chunk.expiresAt ?? null}, now())`;
    });

    await this.txHost.tx.$executeRaw`
      INSERT INTO "ai_memory_chunks"
        ("id", "workspaceId", "projectId", "sourceType", "sourceId", "chunkIndex", "content", "embedding", "metadata", "expiresAt", "createdAt")
      VALUES ${Prisma.join(rows)}
    `;
  }

  async search(
    queryEmbedding: number[],
    filter: AiMemorySearchFilter,
  ): Promise<AiMemorySearchResult[]> {
    const vectorLiteral = toVectorLiteral(queryEmbedding);
    const rows = await this.txHost.tx.$queryRaw<
      {
        id: string;
        content: string;
        sourceType: AiMemorySourceType;
        sourceId: string;
        distance: number;
      }[]
    >`
      SELECT "id", "content", "sourceType", "sourceId", ("embedding" <=> ${vectorLiteral}::vector) AS distance
      FROM "ai_memory_chunks"
      WHERE "workspaceId" = ${filter.workspaceId}
        AND "embedding" IS NOT NULL
        AND ("expiresAt" IS NULL OR "expiresAt" > now())
        ${filter.projectId ? Prisma.sql`AND ("projectId" = ${filter.projectId} OR "projectId" IS NULL)` : Prisma.empty}
        ${filter.sourceType ? Prisma.sql`AND "sourceType" = ${filter.sourceType}::"AiMemorySourceType"` : Prisma.empty}
      ORDER BY distance ASC
      LIMIT ${filter.topK}
    `;

    return rows.map((row) => ({
      id: row.id,
      content: row.content,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      score: 1 - row.distance,
    }));
  }

  async deleteBySource(
    sourceType: AiMemorySourceType,
    sourceId: string,
  ): Promise<void> {
    await this.txHost.tx.$executeRaw`
      DELETE FROM "ai_memory_chunks" WHERE "sourceType" = ${sourceType}::"AiMemorySourceType" AND "sourceId" = ${sourceId}
    `;
  }

  async deleteByProject(projectId: string): Promise<void> {
    await this.txHost.tx.$executeRaw`
      DELETE FROM "ai_memory_chunks" WHERE "projectId" = ${projectId}
    `;
  }

  deleteExpired(): Promise<number> {
    return this.txHost.tx.$executeRaw`
      DELETE FROM "ai_memory_chunks" WHERE "expiresAt" IS NOT NULL AND "expiresAt" <= now()
    `;
  }
}

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.map((n) => (Number.isFinite(n) ? n : 0)).join(',')}]`;
}
