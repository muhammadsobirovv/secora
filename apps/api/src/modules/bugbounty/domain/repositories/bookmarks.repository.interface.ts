import type { Bookmark, BookmarkEntityType } from '../../../../prisma-types.js';

export interface CreateBookmarkInput {
  workspaceId: string;
  userId: string;
  entityType: BookmarkEntityType;
  entityId: string;
}

export interface BookmarksRepository {
  create(input: CreateBookmarkInput): Promise<Bookmark>;
  findById(id: string): Promise<Bookmark | null>;
  findByUserAndEntity(
    userId: string,
    entityType: BookmarkEntityType,
    entityId: string,
  ): Promise<Bookmark | null>;
  list(userId: string, entityType?: BookmarkEntityType): Promise<Bookmark[]>;
  delete(id: string): Promise<void>;
}

export const BOOKMARKS_REPOSITORY = Symbol('BOOKMARKS_REPOSITORY');
