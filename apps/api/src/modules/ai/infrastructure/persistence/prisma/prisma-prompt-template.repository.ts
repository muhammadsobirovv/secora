import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import { Prisma } from '../../../../../prisma-types.js';
import type {
  CreatePromptTemplateInput,
  ListPromptTemplatesFilter,
  PromptTemplateRecord,
  PromptTemplateRepository,
  UpdatePromptTemplateInput,
} from '../../../domain/repositories/prompt-template.repository.interface.js';

/// See the doc comment on PromptTemplateRepository — raw SQL only, same
/// reasoning as PrismaAgentOrchestrationRepository/
/// PrismaKnowledgeBaseReferenceRepository.
@Injectable()
export class PrismaPromptTemplateRepository implements PromptTemplateRepository {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  async create(input: CreatePromptTemplateInput): Promise<PromptTemplateRecord> {
    const rows = await this.txHost.tx.$queryRaw<PromptTemplateRecord[]>`
      INSERT INTO "prompt_templates"
        ("id", "workspaceId", "name", "description", "promptText", "category", "createdBy", "createdAt", "updatedAt")
      VALUES
        (${randomUUID()}, ${input.workspaceId}, ${input.name}, ${input.description ?? null}, ${input.promptText}, ${input.category ?? null}, ${input.createdBy}, now(), now())
      RETURNING *
    `;
    return rows[0];
  }

  async findById(id: string): Promise<PromptTemplateRecord | null> {
    const rows = await this.txHost.tx.$queryRaw<PromptTemplateRecord[]>`
      SELECT * FROM "prompt_templates" WHERE "id" = ${id}
    `;
    return rows[0] ?? null;
  }

  async list(filter: ListPromptTemplatesFilter): Promise<PromptTemplateRecord[]> {
    const search = filter.search?.trim();
    const rows = await this.txHost.tx.$queryRaw<PromptTemplateRecord[]>`
      SELECT * FROM "prompt_templates"
      WHERE "workspaceId" = ${filter.workspaceId}
        ${filter.category ? Prisma.sql`AND "category" = ${filter.category}` : Prisma.empty}
        ${
          search
            ? Prisma.sql`AND (
                "name" ILIKE ${`%${search}%`}
                OR "description" ILIKE ${`%${search}%`}
                OR "promptText" ILIKE ${`%${search}%`}
              )`
            : Prisma.empty
        }
      ORDER BY "updatedAt" DESC
    `;
    return rows;
  }

  async update(
    id: string,
    data: UpdatePromptTemplateInput,
  ): Promise<PromptTemplateRecord> {
    const sets: Prisma.Sql[] = [];
    if (data.name !== undefined) sets.push(Prisma.sql`"name" = ${data.name}`);
    if (data.description !== undefined) {
      sets.push(Prisma.sql`"description" = ${data.description}`);
    }
    if (data.promptText !== undefined) {
      sets.push(Prisma.sql`"promptText" = ${data.promptText}`);
    }
    if (data.category !== undefined) {
      sets.push(Prisma.sql`"category" = ${data.category}`);
    }
    sets.push(Prisma.sql`"updatedAt" = now()`);

    const rows = await this.txHost.tx.$queryRaw<PromptTemplateRecord[]>`
      UPDATE "prompt_templates" SET ${Prisma.join(sets, ', ')} WHERE "id" = ${id} RETURNING *
    `;
    return rows[0];
  }

  async delete(id: string): Promise<void> {
    await this.txHost.tx.$executeRaw`
      DELETE FROM "prompt_templates" WHERE "id" = ${id}
    `;
  }
}
