import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { KnowledgeBaseReferenceFramework } from '@pentesthub/shared';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import { Prisma } from '../../../../../prisma-types.js';
import type {
  KnowledgeBaseReferenceEntryRecord,
  KnowledgeBaseReferenceRepository,
  ListKnowledgeBaseReferenceFilter,
  UpsertKnowledgeBaseReferenceEntryInput,
} from '../../../domain/repositories/knowledge-base-reference.repository.interface.js';

type Row = Omit<KnowledgeBaseReferenceEntryRecord, 'metadata'> & {
  metadata: unknown;
};

function toRecord(row: Row): KnowledgeBaseReferenceEntryRecord {
  return {
    ...row,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
  };
}

/// See the doc comment on KnowledgeBaseReferenceRepository — raw SQL only,
/// same reasoning as PrismaAgentOrchestrationRepository.
@Injectable()
export class PrismaKnowledgeBaseReferenceRepository
  implements KnowledgeBaseReferenceRepository
{
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  async upsert(
    input: UpsertKnowledgeBaseReferenceEntryInput,
  ): Promise<KnowledgeBaseReferenceEntryRecord> {
    const rows = await this.txHost.tx.$queryRaw<Row[]>`
      INSERT INTO "knowledge_base_reference_entries"
        ("id", "framework", "code", "title", "summary", "url", "metadata", "createdAt", "updatedAt")
      VALUES
        (${randomUUID()}, ${input.framework}::"KnowledgeBaseReferenceFramework", ${input.code}, ${input.title}, ${input.summary}, ${input.url ?? null}, ${input.metadata ? JSON.stringify(input.metadata) : null}::jsonb, now(), now())
      ON CONFLICT ("framework", "code") DO UPDATE SET
        "title" = EXCLUDED."title",
        "summary" = EXCLUDED."summary",
        "url" = EXCLUDED."url",
        "metadata" = EXCLUDED."metadata",
        "updatedAt" = now()
      RETURNING *
    `;
    return toRecord(rows[0]);
  }

  async findById(id: string): Promise<KnowledgeBaseReferenceEntryRecord | null> {
    const rows = await this.txHost.tx.$queryRaw<Row[]>`
      SELECT * FROM "knowledge_base_reference_entries" WHERE "id" = ${id}
    `;
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async findByFrameworkAndCode(
    framework: KnowledgeBaseReferenceFramework,
    code: string,
  ): Promise<KnowledgeBaseReferenceEntryRecord | null> {
    const rows = await this.txHost.tx.$queryRaw<Row[]>`
      SELECT * FROM "knowledge_base_reference_entries"
      WHERE "framework" = ${framework}::"KnowledgeBaseReferenceFramework" AND "code" = ${code}
    `;
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async list(
    filter: ListKnowledgeBaseReferenceFilter,
  ): Promise<KnowledgeBaseReferenceEntryRecord[]> {
    const rows = await this.txHost.tx.$queryRaw<Row[]>`
      SELECT * FROM "knowledge_base_reference_entries"
      WHERE 1=1
        ${filter.framework ? Prisma.sql`AND "framework" = ${filter.framework}::"KnowledgeBaseReferenceFramework"` : Prisma.empty}
      ORDER BY "framework" ASC, "code" ASC
      LIMIT ${filter.limit ?? 100}
    `;
    return rows.map(toRecord);
  }

  async delete(id: string): Promise<void> {
    await this.txHost.tx.$executeRaw`
      DELETE FROM "knowledge_base_reference_entries" WHERE "id" = ${id}
    `;
  }

  async count(): Promise<number> {
    const rows = await this.txHost.tx.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM "knowledge_base_reference_entries"
    `;
    return Number(rows[0]?.count ?? 0);
  }
}
