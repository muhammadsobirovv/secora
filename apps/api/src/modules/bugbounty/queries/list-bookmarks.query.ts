import { Inject } from '@nestjs/common';
import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { BookmarkDto, ListBookmarksQueryDto } from '@pentesthub/shared';
import {
  BOOKMARKS_REPOSITORY,
  type BookmarksRepository,
} from '../domain/repositories/bookmarks.repository.interface.js';
import { toBookmarkDto } from '../mappers/to-bookmark-dto.mapper.js';

export class ListBookmarksQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly filter: ListBookmarksQueryDto,
  ) {}
}

/// No workspace resolution needed — BookmarksRepository.list() is scoped
/// by userId directly (a bookmark's owner is always its creator; there's
/// no cross-user bookmark visibility to enforce), unlike every other
/// Module 6 query which resolves the caller's personal workspace first.
@QueryHandler(ListBookmarksQuery)
export class ListBookmarksHandler implements IQueryHandler<
  ListBookmarksQuery,
  BookmarkDto[]
> {
  constructor(
    @Inject(BOOKMARKS_REPOSITORY)
    private readonly bookmarksRepository: BookmarksRepository,
  ) {}

  async execute(query: ListBookmarksQuery): Promise<BookmarkDto[]> {
    const bookmarks = await this.bookmarksRepository.list(
      query.userId,
      query.filter.entityType,
    );
    return bookmarks.map(toBookmarkDto);
  