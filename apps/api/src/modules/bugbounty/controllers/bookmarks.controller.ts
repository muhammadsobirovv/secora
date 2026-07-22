import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { BookmarkDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import {
  CreateBookmarkDto,
  ListBookmarksQueryParamsDto,
} from '../dto/bookmark.dto.js';
import {
  CreateBookmarkCommand,
  DeleteBookmarkCommand,
} from '../commands/bookmark.commands.js';
import { ListBookmarksQuery } from '../queries/list-bookmarks.query.js';

@ApiTags('bugbounty')
@ApiBearerAuth()
@Controller('bugbounty/bookmarks')
export class BookmarksController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List my bookmarks' })
  list(
    @Query() query: ListBookmarksQueryParamsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<BookmarkDto[]> {
    return this.queryBus.execute(new ListBookmarksQuery(user.id, query));
  }

  @Post()
  @ApiOperation({ summary: 'Bookmark a target/finding/report/payload/note' })
  create(
    @Body() dto: CreateBookmarkDto,
    @CurrentUser() user: RequestUser,
  ): Promise<BookmarkDto> {
    return this.commandBus.execute(new CreateBookmarkCommand(user.id, dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a bookmark' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.commandBus.execute(new DeleteBookmarkCommand(user.id, id));
  }
}
