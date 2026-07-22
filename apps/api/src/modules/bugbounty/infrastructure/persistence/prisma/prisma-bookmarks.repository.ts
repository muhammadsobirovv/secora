import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type {
  BookmarksRepository,
  CreateBookmarkInput,
} from '../../../domain/repositories/bookmarks.repository.interface.js';
import type {
  Bookmark,
  BookmarkEntityType,
} from '../../../../../prisma-types.js';

@Injectable()
export class PrismaBookmarksRepository implements BookmarksRepository {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  create(input: CreateBookmarkInput): Promise<Bookmark> {
    return this.txHost.tx.bookmark.create({
      data: {
        workspaceId: input.workspaceId,
        userId: input.userId,
        entityType: input.entityType,
        entityId: input.entityId,
      },
    });
  }

  findById(id: string): Promise<Bookmark | null> {
    return this.txHost.tx.bookmark.findUnique({ where: { id } });
  }

  findByUserAndEntity(
    userId: string,
    entityType: BookmarkEntityType,
    entityId: string,
  ): Promise<Bookmark | null> {
    return this.txHost.tx.bookmark.findUnique({
      where: { userId_entityType_entityId: { userId, entityType, entityId } },
    });
  }

  list(userId: string, entityType?: BookmarkEntityType): Promise<Bookmark[]> {
    return this.txHost.tx.bookmark.findMany({
      where: { userId, ...(entityType ? { entityType } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async delete(id: string): Promise<void> {
    await this.txHost.tx.bookmark.delete({ where: { id } });
  }
}
