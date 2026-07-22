import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type {
  CreatePayloadLibraryEntryInput,
  ListPayloadLibraryFilter,
  PayloadLibraryRepository,
  UpdatePayloadLibraryEntryInput,
} from '../../../domain/repositories/payload-library.repository.interface.js';
import type { PayloadLibraryEntry } from '../../../../../prisma-types.js';

@Injectable()
export class PrismaPayloadLibraryRepository implements PayloadLibraryRepository {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  create(input: CreatePayloadLibraryEntryInput): Promise<PayloadLibraryEntry> {
    return this.txHost.tx.payloadLibraryEntry.create({
      data: {
        workspaceId: input.workspaceId,
        category: input.category,
        title: input.title,
        description: input.description,
        example: input.example,
        references: input.references ?? [],
        tags: input.tags ?? [],
        createdBy: input.createdBy,
      },
    });
  }

  findById(id: string): Promise<PayloadLibraryEntry | null> {
    return this.txHost.tx.payloadLibraryEntry.findFirst({
      where: { id, deletedAt: null },
    });
  }

  /// Seed entries (workspaceId null) are always included alongside a
  /// workspace's own custom entries — see interface comment.
  ///
  /// The workspace-visibility OR and the search OR are kept in separate
  /// `AND` branches rather than two `OR:` keys on the same object literal
  /// — a real bug this fixed: JS object literals silently keep only the
  /// last of two duplicate keys, so a naive `{ OR: [...visibility], OR:
  /// [...search] }` would drop the visibility filter entirely whenever a
  /// search term was provided, leaking every workspace's custom payload
  /// entries into the results.
  list(filter: ListPayloadLibraryFilter): Promise<PayloadLibraryEntry[]> {
    return this.txHost.tx.payloadLibraryEntry.findMany({
      where: {
        deletedAt: null,
        AND: [
          { OR: [{ workspaceId: filter.workspaceId }, { workspaceId: null }] },
          ...(filter.search
            ? [
                {
                  OR: [
                    {
                      title: {
                        contains: filter.search,
                        mode: 'insensitive' as const,
                      },
                    },
                    {
                      description: {
                        contains: filter.search,
                        mode: 'insensitive' as const,
                      },
                    },
                  ],
                },
              ]
            : []),
        ],
        ...(filter.category ? { category: filter.category } : {}),
        ...(filter.tag ? { tags: { has: filter.tag } } : {}),
      },
      orderBy: [{ category: 'asc' }, { title: 'asc' }],
    });
  }

  update(
    id: string,
    input: UpdatePayloadLibraryEntryInput,
  ): Promise<PayloadLibraryEntry> {
    return this.txHost.tx.payloadLibraryEntry.update({
      where: { id },
      data: {
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.example !== undefined ? { example: input.example } : {}),
        ...(input.references !== undefined
          ? { references: input.references }
          : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
        ...(input.aiExplanation !== undefined
          ? { aiExplanation: input.aiExplanation }
          : {}),
      },
    });
  }

  async softDelete(id: string): Promise<void> {
    await this.txHost.tx.payloadLibraryEntry.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
