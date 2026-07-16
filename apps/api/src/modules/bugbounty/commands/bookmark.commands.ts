import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus, Inject } from '@nestjs/common';
import type { BookmarkDto, CreateBookmarkRequestDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  BOOKMARKS_REPOSITORY,
  type BookmarksRepository,
} from '../domain/repositories/bookmarks.repository.interface.js';
import { resolveWorkspaceForCaller } from '../authorization.util.js';
import { toBookmarkDto } from '../mappers/to-bookmark-dto.mapper.js';

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export class CreateBookmarkCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly data: CreateBookmarkRequestDto,
  ) {}
}

@CommandHandler(CreateBookmarkCommand)
export class CreateBookmarkHandler implements ICommandHandler<
  CreateBookmarkCommand,
  BookmarkDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(BOOKMARKS_REPOSITORY)
    private readonly bookmarksRepository: BookmarksRepository,
  ) {}

  async execute(command: CreateBookmarkCommand): Promise<BookmarkDto> {
    const workspace = await resolveWorkspaceForCaller(
      this.workspacesRepository,
      command.userId,
    );

    const existing = await this.bookmarksRepository.findByUserAndEntity(
      command.userId,
      command.data.entityType,
      command.data.entityId,
    );
    if (existing) {
      throw new AppException(
        'BOOKMARK_ALREADY_EXISTS',
        'This item is already bookmarked.',
        HttpStatus.CONFLICT,
      );
    }

    const bookmark = await this.bookmarksRepository.create({
      workspaceId: workspace.id,
      userId: command.userId,
      entityType: command.data.entityType,
      entityId: command.data.entityId,
    });

    return toBookmarkDto(bookmark);
  }
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export class DeleteBookmarkCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly bookmarkId: string,
  ) {}
}

@CommandHandler(DeleteBookmarkCommand)
export class DeleteBookmarkHandler implements ICommandHandler<
  DeleteBookmarkCommand,
  void
> {
  constructor(
    @Inject(BOOKMARKS_REPOSITORY)
    private readonly bookmarksRepository: BookmarksRepository,
  ) {}

  async execute(command: DeleteBookmarkCommand): Promise<void> {
    const bookmark = await this.bookmarksRepository.findById(
      command.bookmarkId,
    );
    // Same enumeration-safe-404 shape as everywhere else: a bookmark that
    // doesn't exist and one owned by someone else both 404, rather than
    // the latter 403ing (which would confirm the id exists for someone).
    if (!bookmark || bookmark.userId !== command.userId) {
      throw new AppException(
        'BOOKMARK_NOT_FOUND',
        'Bookmark not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    await this.bookmarksRepository.delete(command.bookm